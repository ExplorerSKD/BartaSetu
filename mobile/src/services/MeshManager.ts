/**
 * MeshManager.ts
 * BartaSetu Mobile Application
 *
 * The core decentralized store-and-forward mesh orchestrator:
 * - Subscribes to NativeBleBridge events (discovery, loss, incoming messages, relays)
 * - Manages deduplication and seen message caches
 * - Dual-role routing:
 *   1. Internet Gateway Role: Directly uploads messages to FastAPI backend (/api/messages, /api/messages/sync)
 *   2. Offline Relay Role: Evaluates peer candidates with RelayScorer, increments hop counts,
 *      enforces max-hop limits, and buffers messages locally in SQLite
 * - Opportunistic Store-and-Forward sync: Flushes pending/relayed messages as soon as connectivity resumes
 * - Updates SQLite database and Zustand UI stores in real time
 */

import { Database } from '../database/Database';
import { useMeshStore } from '../store/meshStore';
import {
  nativeBleBridge,
  BleDevice,
  MessageReceivedEvent,
  MessageRelayedEvent,
  ConnectionStateChangeEvent,
  DeviceLostEvent,
} from './NativeBleBridge';
import { RelayScorer, RelayCandidate } from './RelayScorer';
import {
  LocalMessage,
  KnownDevice,
  MessageStatus,
  MessagePriority,
  MessageContentType,
} from '../types';

// ============================================================================
// Configuration & Types
// ============================================================================

export interface MeshManagerConfig {
  deviceId?: string;
  userId?: string;
  backendUrl?: string;
  syncIntervalMs?: number;
  healthCheckIntervalMs?: number;
  maxDefaultHops?: number;
  defaultTtlSeconds?: number;
  isSimulatedConnectivity?: boolean;
}

export interface BackendMessagePayload {
  id: string;
  recipient_id: string;
  encrypted_content: string;
  encrypted_key?: string | null;
  iv?: string | null;
  content_type: string;
  priority: string;
  hop_count: number;
  max_hops: number;
  ttl: number;
  expires_at: string;
  created_at: string;
  gateway_device_id?: string | null;
  route?: Array<{ device_id: string; hop_number: number; action: string }>;
}

// ============================================================================
// MeshManager Class
// ============================================================================

export class MeshManager {
  private static instance: MeshManager | null = null;

  private deviceId: string;
  private userId: string;
  private backendUrl: string;
  private syncIntervalMs: number;
  private healthCheckIntervalMs: number;
  private maxDefaultHops: number;
  private defaultTtlSeconds: number;

  private isRunning: boolean = false;
  private isOnline: boolean = false;
  private isSimulatedConnectivity: boolean = false;

  // In-memory cache for ultra-fast deduplication (supplements SQLite seen_messages)
  private seenMessageMemoryCache: Set<string> = new Set();
  private pendingRelayQueue: Set<string> = new Set();

  // Active event unsubscriptions
  private unbindListeners: Array<() => void> = [];
  private syncTimer: any = null;
  private healthCheckTimer: any = null;
  private isSyncing: boolean = false;

  constructor(config?: MeshManagerConfig) {
    this.deviceId = config?.deviceId || this.generateNodeId();
    this.userId = config?.userId || `user-${this.deviceId.slice(-6)}`;
    // Android emulator loops back to host via 10.0.2.2; standard dev default to localhost
    this.backendUrl = config?.backendUrl || 'http://10.0.2.2:8000';
    this.syncIntervalMs = config?.syncIntervalMs || 25000;
    this.healthCheckIntervalMs = config?.healthCheckIntervalMs || 15000;
    this.maxDefaultHops = config?.maxDefaultHops || 10;
    this.defaultTtlSeconds = config?.defaultTtlSeconds || 86400; // 24 hours
    this.isSimulatedConnectivity = Boolean(config?.isSimulatedConnectivity);
  }

  public static getInstance(config?: MeshManagerConfig): MeshManager {
    if (!MeshManager.instance) {
      MeshManager.instance = new MeshManager(config);
    }
    return MeshManager.instance;
  }

  // ==========================================================================
  // Lifecycle & Initialization
  // ==========================================================================

  /**
   * Initializes SQLite database, wires NativeBleBridge listeners, and starts mesh loops
   */
  public async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log('[MeshManager] Already initialized and running.');
      return;
    }

    console.log(`[MeshManager] Initializing node (ID: ${this.deviceId})...`);

    // 1. Ensure SQLite database is initialized
    try {
      await Database.initDatabase();
      console.log('[MeshManager] Local SQLite database initialized.');
    } catch (err) {
      console.error('[MeshManager] Database initialization warning:', err);
    }

    // 2. Preload known devices and message history into Zustand store
    await this.hydrateStoreFromDatabase();

    // 3. Register NativeBleBridge event subscriptions
    this.bindBridgeEvents();

    // 4. Start foreground BLE Mesh service
    try {
      await nativeBleBridge.startMeshService();
      useMeshStore.getState().setMeshActive(true);
      useMeshStore.getState().setMeshStatus('ACTIVE');
    } catch (err) {
      console.error('[MeshManager] Failed to start native mesh service:', err);
      useMeshStore.getState().setMeshStatus('ERROR');
    }

    // 5. Initial Internet connectivity check & periodic timers
    await this.checkInternetConnectivity();
    this.startPeriodicTimers();

    this.isRunning = true;
    console.log('[MeshManager] Mesh orchestrator started successfully.');
  }

  /**
   * Stops mesh service, unbinds listeners, and halts background timers
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[MeshManager] Stopping mesh orchestrator...');

    // Halt timers
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Unbind listeners
    this.unbindListeners.forEach((unbind) => unbind());
    this.unbindListeners = [];

    // Stop native BLE service
    try {
      await nativeBleBridge.stopMeshService();
    } catch (err) {
      console.error('[MeshManager] Error stopping native bridge:', err);
    }

    useMeshStore.getState().setMeshActive(false);
    useMeshStore.getState().setMeshStatus('STOPPED');
    this.isRunning = false;
  }

  // ==========================================================================
  // NativeBleBridge Event Binding
  // ==========================================================================

  private bindBridgeEvents(): void {
    // 1. onDeviceDiscovered
    const unbindDiscovered = nativeBleBridge.onDeviceDiscovered(
      this.handleDeviceDiscovered.bind(this)
    );
    this.unbindListeners.push(unbindDiscovered);

    // 2. onDeviceLost
    const unbindLost = nativeBleBridge.onDeviceLost(
      this.handleDeviceLost.bind(this)
    );
    this.unbindListeners.push(unbindLost);

    // 3. onMessageReceived
    const unbindMessage = nativeBleBridge.onMessageReceived(
      this.handleMessageReceived.bind(this)
    );
    this.unbindListeners.push(unbindMessage);

    // 4. onMessageRelayed
    const unbindRelayed = nativeBleBridge.onMessageRelayed(
      this.handleMessageRelayed.bind(this)
    );
    this.unbindListeners.push(unbindRelayed);

    // 5. onConnectionStateChange
    const unbindConnection = nativeBleBridge.onConnectionStateChange(
      this.handleConnectionStateChange.bind(this)
    );
    this.unbindListeners.push(unbindConnection);
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handles peer device discovered over BLE scanning.
   * Updates SQLite known_devices and updates Zustand store.
   */
  public async handleDeviceDiscovered(bleDevice: BleDevice): Promise<void> {
    if (!bleDevice || !bleDevice.id) return;

    // Calculate smart routing score for this peer
    const candidate: RelayCandidate = {
      deviceId: bleDevice.id,
      hasInternet: Boolean(bleDevice.hasInternet),
      rssi: bleDevice.rssi ?? -70,
      distanceMeters: bleDevice.distanceMeters ?? 15,
      batteryLevel: bleDevice.batteryLevel ?? 80,
      previousSuccessRate: 0.95,
    };
    const calculatedScore = RelayScorer.calculateRelayScore(candidate) / 100;

    const knownDevice: KnownDevice = {
      id: bleDevice.id,
      device_id: bleDevice.id,
      name: bleDevice.name || `Node-${bleDevice.id.slice(-4)}`,
      display_name: bleDevice.name || `Node-${bleDevice.id.slice(-4)}`,
      lastSeen: bleDevice.lastSeen || Date.now(),
      last_seen: new Date(bleDevice.lastSeen || Date.now()).toISOString(),
      rssi: bleDevice.rssi ?? -70,
      hasInternet: Boolean(bleDevice.hasInternet),
      has_internet: Boolean(bleDevice.hasInternet),
      batteryLevel: bleDevice.batteryLevel ?? 80,
      battery_level: bleDevice.batteryLevel !== undefined ? bleDevice.batteryLevel / 100 : 0.8,
      relayScore: Number(calculatedScore.toFixed(2)),
      relay_score: Number(calculatedScore.toFixed(2)),
    };

    try {
      // 1. Update known_devices in SQLite
      await Database.saveOrUpdateDevice(knownDevice);
    } catch (err) {
      console.error(`[MeshManager] Failed to persist device ${knownDevice.id}:`, err);
    }

    // 2. Update Zustand store
    useMeshStore.getState().upsertDevice(knownDevice);

    // 3. If there are messages pending in the relay queue, trigger opportunistic relay attempt
    if (this.pendingRelayQueue.size > 0) {
      this.triggerPendingRelays();
    }
  }

  /**
   * Handles device lost or out of BLE radio range
   */
  public handleDeviceLost(event: DeviceLostEvent): void {
    console.log(`[MeshManager] Device lost: ${event.deviceId}`);
    useMeshStore.getState().removeDevice(event.deviceId);
  }

  /**
   * The core decentralized store-and-forward mesh message processor:
   * 1. Parses message JSON
   * 2. Checks deduplication via Database.isMessageSeen(message.id)
   * 3. If seen: drops message
   * 4. If not seen: marks seen in Database.markMessageSeen(message.id)
   * 5. Saves in Database.saveMessage(message)
   * 6. If device has Internet connectivity (Internet Gateway role):
   *    - Uploads message directly to FastAPI backend (/api/messages)
   *    - Updates status to GATEWAY_REACHED / SERVER_RECEIVED
   * 7. If device has NO Internet connectivity (Relay role):
   *    - Increments hop_count
   *    - If hop_count >= max_hops, drops message (prevents infinite loops)
   *    - Queues for forward to next suitable nearby peer
   */
  public async handleMessageReceived(event: MessageReceivedEvent): Promise<void> {
    if (!event || !event.message) {
      console.warn('[MeshManager] Received empty message event, ignoring.');
      return;
    }

    // 1. Parses message JSON
    let message: LocalMessage;
    try {
      const raw = typeof event.message === 'string' ? JSON.parse(event.message) : event.message;
      message = this.normalizeMessagePayload(raw, event.sender);
    } catch (err) {
      console.error('[MeshManager] Failed to parse message JSON payload:', err, event.message);
      return;
    }

    const messageId = message.id;

    // 2. Checks deduplication via in-memory cache and Database.isMessageSeen(message.id)
    if (this.seenMessageMemoryCache.has(messageId)) {
      console.log(`[MeshManager] Message ${messageId} already seen in cache. Dropping to prevent echo loop.`);
      return;
    }

    const alreadySeen = await Database.isMessageSeen(messageId);
    if (alreadySeen) {
      this.seenMessageMemoryCache.add(messageId);
      console.log(`[MeshManager] Message ${messageId} already seen in SQLite. Dropping.`);
      return;
    }

    // 4. If not seen: marks seen in Database.markMessageSeen(message.id)
    this.seenMessageMemoryCache.add(messageId);
    try {
      await Database.markMessageSeen(messageId);
    } catch (err) {
      console.error(`[MeshManager] Failed to mark message seen for ${messageId}:`, err);
    }

    // Check message TTL expiration
    const expiresAtMs = new Date(message.expires_at).getTime();
    if (!isNaN(expiresAtMs) && Date.now() > expiresAtMs) {
      console.warn(`[MeshManager] Message ${messageId} has expired (TTL passed). Dropping.`);
      message.status = 'EXPIRED';
      await Database.saveMessage(message);
      return;
    }

    // 5. Saves in Database.saveMessage(message)
    try {
      await Database.saveMessage(message);
    } catch (err) {
      console.error(`[MeshManager] Failed to save message ${messageId}:`, err);
    }

    // Update Zustand store
    useMeshStore.getState().addMessage(message);

    // If recipient is this local user / device, confirm delivery and finish
    if (message.recipient_id === this.userId || message.recipient_id === this.deviceId) {
      console.log(`[MeshManager] Message ${messageId} reached destination recipient!`);
      await Database.updateMessageStatus(messageId, 'DELIVERED');
      useMeshStore.getState().updateMessageStatus(messageId, 'DELIVERED');
      return;
    }

    // 6. Role Decision: Internet Gateway Role vs Offline Relay Role
    const hasInternet = await this.hasInternetConnectivity();

    if (hasInternet) {
      // ------------------------------------------------------------------------
      // Internet Gateway Role: Direct upload to FastAPI backend
      // ------------------------------------------------------------------------
      console.log(`[MeshManager] Acting as INTERNET GATEWAY for message ${messageId}. Uploading to backend...`);
      const uploadSuccess = await this.uploadMessageToGateway(message);

      if (uploadSuccess) {
        console.log(`[MeshManager] Gateway sync successful for message ${messageId}. Updating status to SERVER_RECEIVED.`);
        await Database.updateMessageStatus(messageId, 'SERVER_RECEIVED');
        useMeshStore.getState().updateMessageStatus(messageId, 'SERVER_RECEIVED');
      } else {
        // Upload failed temporarily (e.g. timeout), mark as GATEWAY_REACHED so periodic sync retries
        console.warn(`[MeshManager] Gateway upload failed temporarily for ${messageId}. Marking GATEWAY_REACHED.`);
        await Database.updateMessageStatus(messageId, 'GATEWAY_REACHED');
        useMeshStore.getState().updateMessageStatus(messageId, 'GATEWAY_REACHED');
      }
    } else {
      // ------------------------------------------------------------------------
      // Offline Relay Role: Hop count check and smart mesh forwarding
      // ------------------------------------------------------------------------
      console.log(`[MeshManager] Device offline. Acting as RELAY NODE for message ${messageId}.`);

      // 7. Increments hop_count
      message.hop_count = (message.hop_count || 0) + 1;

      // If hop_count >= max_hops, drops message (prevents infinite loops)
      if (message.hop_count >= message.max_hops) {
        console.warn(
          `[MeshManager] Message ${messageId} reached max hops (${message.hop_count}/${message.max_hops}). Dropping to prevent endless flooding.`
        );
        await Database.updateMessageStatus(messageId, 'FAILED');
        useMeshStore.getState().updateMessageStatus(messageId, 'FAILED');
        return;
      }

      // Update message in database with incremented hop_count
      await Database.saveMessage(message);

      // Queues for forward to next suitable nearby peer
      await this.queueMessageForRelay(message);
    }
  }

  /**
   * Handles confirmation of message relay from Native BLE bridge
   */
  public async handleMessageRelayed(event: MessageRelayedEvent): Promise<void> {
    console.log(
      `[MeshManager] Relay confirmation received: msg=${event.messageId}, target=${event.targetDeviceId}, success=${event.success}`
    );

    if (event.success) {
      await Database.updateMessageStatus(event.messageId, 'RELAYED');
      useMeshStore.getState().updateMessageStatus(event.messageId, 'RELAYED');
      useMeshStore.getState().incrementRelayedCount();
      useMeshStore.getState().incrementHopsSaved(1);

      try {
        await Database.recordRelay(event.messageId, this.deviceId, event.targetDeviceId, true);
      } catch (err) {
        console.error('[MeshManager] Failed to record relay history entry:', err);
      }
    }
  }

  /**
   * Handles BLE connection state changes
   */
  public handleConnectionStateChange(event: ConnectionStateChangeEvent): void {
    console.log(`[MeshManager] Connection state change: device=${event.deviceId}, state=${event.state}`);
  }

  // ==========================================================================
  // Store-and-Forward Relay & Peer Selection
  // ==========================================================================

  /**
   * Queues message for relay to nearby mesh peers:
   * - Stores message locally
   * - Triggers BLE broadcast / transfer to best available peer
   */
  public async queueMessageForRelay(message: LocalMessage): Promise<void> {
    this.pendingRelayQueue.add(message.id);

    // 1. Store message locally with RELAYING status
    message.status = 'RELAYING';
    await Database.saveMessage(message);
    useMeshStore.getState().updateMessageStatus(message.id, 'RELAYING');

    // 2. Select best available peer using RelayScorer
    const candidates = await this.getRelayCandidates(message.sender_id);

    if (candidates.length === 0) {
      console.log(`[MeshManager] No active BLE peers in range for message ${message.id}. Buffered locally in store-and-forward queue.`);
      // Revert status to PENDING/STORED so it can be retried later
      await Database.updateMessageStatus(message.id, 'PENDING');
      useMeshStore.getState().updateMessageStatus(message.id, 'PENDING');
      return;
    }

    const bestPeer = RelayScorer.selectBestRelay(candidates);
    if (!bestPeer) {
      console.warn(`[MeshManager] Could not rank a suitable relay peer for message ${message.id}.`);
      await Database.updateMessageStatus(message.id, 'PENDING');
      return;
    }

    console.log(`[MeshManager] Selected best peer ${bestPeer.deviceId} for relaying message ${message.id}`);

    // 3. Trigger BLE broadcast / characteristic transfer
    try {
      const serialized = JSON.stringify(message);
      const dispatched = await nativeBleBridge.sendMessageToMesh(serialized);

      if (dispatched) {
        this.pendingRelayQueue.delete(message.id);
        await Database.updateMessageStatus(message.id, 'RELAYED');
        useMeshStore.getState().updateMessageStatus(message.id, 'RELAYED');
        useMeshStore.getState().incrementRelayedCount();

        await Database.recordRelay(message.id, this.deviceId, bestPeer.deviceId, true);
      }
    } catch (err) {
      console.error(`[MeshManager] BLE broadcast failed for message ${message.id}:`, err);
      // Keep in queue for next retry
      await Database.updateMessageStatus(message.id, 'PENDING');
      useMeshStore.getState().updateMessageStatus(message.id, 'PENDING');
    }
  }

  /**
   * Helper to retrieve and map available peer devices into RelayCandidates
   */
  private async getRelayCandidates(excludeDeviceId?: string): Promise<RelayCandidate[]> {
    const nearby = await nativeBleBridge.getNearbyDevices();
    const now = Date.now();

    return nearby
      .filter((dev) => dev.id !== this.deviceId && dev.id !== excludeDeviceId)
      .filter((dev) => now - (dev.lastSeen || now) < 180000) // Filter out nodes stale > 3 min
      .map((dev) => ({
        deviceId: dev.id,
        hasInternet: Boolean(dev.hasInternet),
        rssi: dev.rssi ?? -70,
        distanceMeters: dev.distanceMeters ?? 15,
        batteryLevel: dev.batteryLevel ?? 80,
        previousSuccessRate: 0.95,
      }));
  }

  /**
   * Triggers retry on all pending messages when a new peer or route appears
   */
  private async triggerPendingRelays(): Promise<void> {
    if (this.pendingRelayQueue.size === 0) return;

    const ids = Array.from(this.pendingRelayQueue);
    for (const msgId of ids) {
      const msg = await Database.getMessage(msgId);
      if (msg && (msg.status === 'PENDING' || msg.status === 'RELAYING')) {
        await this.queueMessageForRelay(msg);
      } else {
        this.pendingRelayQueue.delete(msgId);
      }
    }
  }

  // ==========================================================================
  // Internet Gateway & Cloud Synchronization
  // ==========================================================================

  /**
   * Called when internet becomes available (and periodically in background):
   * - Reads all messages in SQLite with status PENDING or RELAYED (or GATEWAY_REACHED)
   * - Batch uploads to FastAPI backend (/api/messages/sync)
   * - Updates local status to SERVER_RECEIVED
   */
  public async checkInternetAndSyncPending(): Promise<void> {
    if (this.isSyncing) return;

    const online = await this.checkInternetConnectivity();
    if (!online) {
      return;
    }

    this.isSyncing = true;
    try {
      // 1. Read all messages in SQLite with status PENDING or RELAYED (or GATEWAY_REACHED)
      const pendingMessages = await Database.getMessages('PENDING');
      const relayedMessages = await Database.getMessages('RELAYED');
      const gatewayMessages = await Database.getMessages('GATEWAY_REACHED');

      const messagesToSync: LocalMessage[] = [
        ...pendingMessages,
        ...relayedMessages,
        ...gatewayMessages,
      ];

      // Remove in-flight duplicates
      const uniqueMessagesMap = new Map<string, LocalMessage>();
      messagesToSync.forEach((m) => uniqueMessagesMap.set(m.id, m));
      const syncList = Array.from(uniqueMessagesMap.values());

      if (syncList.length === 0) {
        return;
      }

      console.log(`[MeshManager] Online sync triggered: ${syncList.length} messages queued for batch upload.`);

      // 2. Prepare payload for FastAPI /api/messages/sync endpoint
      const syncPayload = {
        messages: syncList.map((m) => this.mapToBackendCreateSchema(m)),
      };

      const response = await fetch(`${this.backendUrl}/api/messages/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(syncPayload),
      });

      if (!response.ok) {
        console.warn(`[MeshManager] /api/messages/sync returned HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const results = await response.json();
      console.log(`[MeshManager] Batch sync successfully processed by backend:`, results);

      // 3. Batch updates local status to SERVER_RECEIVED
      for (const msg of syncList) {
        await Database.updateMessageStatus(msg.id, 'SERVER_RECEIVED');
        useMeshStore.getState().updateMessageStatus(msg.id, 'SERVER_RECEIVED');
        this.pendingRelayQueue.delete(msg.id);
      }
    } catch (err) {
      console.error('[MeshManager] Exception during checkInternetAndSyncPending:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Uploads an individual message directly to FastAPI /api/messages
   */
  private async uploadMessageToGateway(message: LocalMessage): Promise<boolean> {
    try {
      const payload = this.mapToBackendCreateSchema(message);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${this.backendUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 201 || response.status === 200 || response.status === 409) {
        // 409 = Conflict / Already exists on server (idempotent success)
        return true;
      }

      console.warn(`[MeshManager] Gateway upload failed with HTTP status ${response.status}`);
      return false;
    } catch (err) {
      console.warn('[MeshManager] Direct gateway upload network error:', err);
      return false;
    }
  }

  /**
   * Checks current device Internet connectivity via probe
   */
  public async checkInternetConnectivity(): Promise<boolean> {
    if (this.isSimulatedConnectivity) {
      this.isOnline = true;
      useMeshStore.getState().setIsOnline(true);
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // Probe backend health or fallback to standard internet captive portal probe
      const probeUrl = `${this.backendUrl}/docs`;
      const response = await fetch(probeUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const online = response.status >= 200 && response.status < 500;
      this.setOnlineState(online);
      return online;
    } catch {
      // Fallback probe for generic public internet
      try {
        const fallbackCtrl = new AbortController();
        const fbTimeout = setTimeout(() => fallbackCtrl.abort(), 3000);
        const fbRes = await fetch('https://clients3.google.com/generate_204', {
          method: 'HEAD',
          signal: fallbackCtrl.signal,
        });
        clearTimeout(fbTimeout);
        const online = fbRes.status === 204 || fbRes.status === 200;
        this.setOnlineState(online);
        return online;
      } catch {
        this.setOnlineState(false);
        return false;
      }
    }
  }

  private setOnlineState(online: boolean): void {
    const wasOnline = this.isOnline;
    this.isOnline = online;
    useMeshStore.getState().setIsOnline(online);

    // If transitioned from offline to online, flush pending sync immediately
    if (!wasOnline && online) {
      console.log('[MeshManager] Connectivity detected! Initiating immediate cloud synchronization.');
      this.checkInternetAndSyncPending();
    }
  }

  // ==========================================================================
  // Outgoing Message Dispatcher (App-Originated)
  // ==========================================================================

  /**
   * Dispatches a message originated on this local device
   */
  public async dispatchLocalMessage(params: {
    recipientId: string;
    encryptedContent: string;
    encryptedKey?: string;
    iv?: string;
    contentType?: MessageContentType;
    priority?: MessagePriority;
    maxHops?: number;
    ttl?: number;
  }): Promise<LocalMessage> {
    const now = new Date().toISOString();
    const ttl = params.ttl || this.defaultTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const localMessage: LocalMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sender_id: this.userId,
      recipient_id: params.recipientId,
      encrypted_content: params.encryptedContent,
      encrypted_key: params.encryptedKey ?? null,
      iv: params.iv ?? null,
      content_type: params.contentType || 'text',
      priority: params.priority || 'normal',
      status: 'PENDING',
      hop_count: 0,
      max_hops: params.maxHops || this.maxDefaultHops,
      ttl: ttl,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    };

    // Save message locally and mark seen by self
    await Database.saveMessage(localMessage);
    await Database.markMessageSeen(localMessage.id);
    this.seenMessageMemoryCache.add(localMessage.id);
    useMeshStore.getState().addMessage(localMessage);

    // Check connectivity: If online -> upload to server; if offline -> queue for relay
    const online = await this.hasInternetConnectivity();
    if (online) {
      console.log(`[MeshManager] Dispatching message ${localMessage.id} directly to cloud backend...`);
      const success = await this.uploadMessageToGateway(localMessage);
      if (success) {
        localMessage.status = 'SERVER_RECEIVED';
        await Database.updateMessageStatus(localMessage.id, 'SERVER_RECEIVED');
        useMeshStore.getState().updateMessageStatus(localMessage.id, 'SERVER_RECEIVED');
      } else {
        await this.queueMessageForRelay(localMessage);
      }
    } else {
      console.log(`[MeshManager] Dispatching message ${localMessage.id} via offline BLE mesh...`);
      await this.queueMessageForRelay(localMessage);
    }

    return localMessage;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  public async hasInternetConnectivity(): Promise<boolean> {
    return this.isOnline;
  }

  public setSimulatedConnectivity(enabled: boolean): void {
    this.isSimulatedConnectivity = enabled;
    this.setOnlineState(enabled);
  }

  public setBackendUrl(url: string): void {
    this.backendUrl = url;
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getUserId(): string {
    return this.userId;
  }

  private startPeriodicTimers(): void {
    // 1. Sync timer
    this.syncTimer = setInterval(() => {
      this.checkInternetAndSyncPending();
    }, this.syncIntervalMs);

    // 2. Health check / connectivity timer
    this.healthCheckTimer = setInterval(() => {
      this.checkInternetConnectivity();
    }, this.healthCheckIntervalMs);
  }

  private async hydrateStoreFromDatabase(): Promise<void> {
    try {
      const devices = await Database.getKnownDevices();
      useMeshStore.getState().setKnownDevices(devices);

      const messages = await Database.getMessages();
      useMeshStore.getState().setMessages(messages);
    } catch (err) {
      console.warn('[MeshManager] Store hydration from database notice:', err);
    }
  }

  private mapToBackendCreateSchema(m: LocalMessage): BackendMessagePayload {
    return {
      id: m.id,
      recipient_id: m.recipient_id,
      encrypted_content: m.encrypted_content,
      encrypted_key: m.encrypted_key || null,
      iv: m.iv || null,
      content_type: m.content_type || 'text',
      priority: m.priority || 'normal',
      hop_count: m.hop_count || 0,
      max_hops: m.max_hops || this.maxDefaultHops,
      ttl: m.ttl || this.defaultTtlSeconds,
      expires_at: m.expires_at,
      created_at: m.created_at,
      gateway_device_id: this.deviceId,
      route: [
        {
          device_id: this.deviceId,
          hop_number: m.hop_count || 0,
          action: 'GATEWAY',
        },
      ],
    };
  }

  private normalizeMessagePayload(raw: any, fallbackSender: string): LocalMessage {
    const now = new Date().toISOString();
    return {
      id: String(raw.id || `msg-${Date.now()}`),
      sender_id: String(raw.sender_id || fallbackSender),
      recipient_id: String(raw.recipient_id || ''),
      encrypted_content: String(raw.encrypted_content || raw.content || ''),
      encrypted_key: raw.encrypted_key ? String(raw.encrypted_key) : null,
      iv: raw.iv ? String(raw.iv) : null,
      content_type: (raw.content_type || 'text') as MessageContentType,
      priority: (raw.priority || 'normal') as MessagePriority,
      status: (raw.status || 'PENDING') as MessageStatus,
      hop_count: Number(raw.hop_count ?? 0),
      max_hops: Number(raw.max_hops ?? this.maxDefaultHops),
      ttl: Number(raw.ttl ?? this.defaultTtlSeconds),
      expires_at: String(raw.expires_at || new Date(Date.now() + 86400000).toISOString()),
      created_at: String(raw.created_at || now),
      updated_at: now,
    };
  }

  private generateNodeId(): string {
    const chars = '0123456789ABCDEF';
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
      if (i < 5) id += ':';
    }
    return `NODE-${id}`;
  }
}

// Export singleton instance and class
export const meshManager = MeshManager.getInstance();
export default meshManager;
