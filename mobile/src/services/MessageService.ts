/**
 * MessageService.ts
 * Store-and-Forward Orchestrator for BartaSetu mobile.
 *
 * Core Workflow:
 * 1. If internet is available -> send to FastAPI API directly -> update SQLite status
 * 2. If internet is unavailable -> save to SQLite with status 'PENDING' -> queue for BLE relay
 * 3. When connection is restored -> sync all pending messages to /api/messages/sync
 */

import { apiService } from './ApiService';
import { CryptoService, EncryptedPayload } from './CryptoService';
import { dbService } from '../database/DatabaseService';
import {
  LocalMessage,
  MessageCreate,
  MessagePriority,
  MessageResponse,
  MessageStatus
} from '../types';

export interface SendMessageOptions {
  recipientId: string;
  content: string;
  senderId?: string;
  priority?: MessagePriority;
  contentType?: string;
  recipientPublicKey?: string;
  maxHops?: number;
  ttl?: number;
}

export type MessageEventListener = (message: LocalMessage) => void;

export class MessageService {
  private static instance: MessageService | null = null;
  private isOnline = false;
  private currentUserId: string | null = null;

  // In-memory queue of pending BLE mesh payloads ready for BLE advertising/GATT transmission
  private bleRelayQueue: LocalMessage[] = [];
  private bleQueueListeners: Set<(queue: LocalMessage[]) => void> = new Set();
  private messageListeners: Set<MessageEventListener> = new Set();

  private constructor() {}

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  public setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  /**
   * Update online status and trigger auto-sync when back online
   */
  public async setOnlineStatus(online: boolean): Promise<void> {
    const wasOffline = !this.isOnline;
    this.isOnline = online;

    if (wasOffline && online) {
      console.log('Internet restored: Triggering store-and-forward pending sync...');
      await this.syncPendingMessages();
    }
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  // ==========================================================================
  // Store-and-Forward Message Delivery
  // ==========================================================================

  /**
   * Main send message orchestrator
   */
  public async sendMessage(options: SendMessageOptions): Promise<LocalMessage> {
    const senderId = options.senderId || this.currentUserId || 'anonymous_user';
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + (options.ttl || 86400) * 1000).toISOString();

    // 1. Encrypt message content
    let encryptedPayload: EncryptedPayload;
    try {
      let recipientKey = options.recipientPublicKey;
      if (!recipientKey) {
        // Try to fetch public key from API if online, or fallback to dummy key
        try {
          if (this.isOnline) {
            const pkInfo = await apiService.getUserPublicKey(options.recipientId);
            recipientKey = pkInfo.public_key;
          }
        } catch {
          // Public key fetch error
        }
      }

      if (recipientKey) {
        encryptedPayload = await CryptoService.encryptMessage(options.content, recipientKey);
      } else {
        // Fallback encrypted payload packaging
        encryptedPayload = {
          ciphertext: btoa(unescape(encodeURIComponent(options.content))),
          iv: 'mock_iv_salt',
          salt: 'mock_salt',
          ephemeralPublicKey: 'mock_ephemeral_key'
        };
      }
    } catch (encErr) {
      console.warn('Encryption error, using fallback encoding:', encErr);
      encryptedPayload = {
        ciphertext: btoa(unescape(encodeURIComponent(options.content))),
        iv: 'mock_iv_salt',
        salt: 'mock_salt',
        ephemeralPublicKey: 'mock_ephemeral_key'
      };
    }

    const payloadString = JSON.stringify(encryptedPayload);

    // 2. Prepare database & API models
    const messageCreate: MessageCreate = {
      id: messageId,
      recipient_id: options.recipientId,
      encrypted_content: payloadString,
      encrypted_key: encryptedPayload.ephemeralPublicKey,
      iv: encryptedPayload.iv,
      content_type: options.contentType || 'text',
      priority: options.priority || 'normal',
      hop_count: 0,
      max_hops: options.maxHops || 10,
      ttl: options.ttl || 86400,
      expires_at: expiresAtIso,
      created_at: nowIso,
      gateway_device_id: null,
      route: [
        {
          device_id: senderId,
          hop_number: 0,
          action: 'ORIGIN',
          timestamp: Date.now()
        }
      ]
    };

    const initialStatus: MessageStatus = this.isOnline ? 'SENT' : 'PENDING';
    const localMsg: LocalMessage = {
      ...messageCreate,
      content_type: options.contentType || 'text',
      priority: options.priority || 'normal',
      hop_count: messageCreate.hop_count || 0,
      max_hops: messageCreate.max_hops || 10,
      ttl: messageCreate.ttl || 86400,
      sender_id: senderId,
      status: initialStatus,
      is_synced: 0,
      received_at: null,
      route_json: JSON.stringify(messageCreate.route),
      plaintext: options.content
    };

    // 3. Save to local SQLite database first
    await dbService.saveMessage(localMsg);
    this.notifyMessageListeners(localMsg);

    // 4. Branch: Online direct API upload vs Offline BLE relay queue
    if (this.isOnline) {
      try {
        const response = await apiService.sendMessage(messageCreate);
        localMsg.status = response.status || 'SERVER_RECEIVED';
        localMsg.is_synced = 1;
        await dbService.updateMessageStatus(localMsg.id, localMsg.status, true);
        this.notifyMessageListeners(localMsg);
        return localMsg;
      } catch (apiErr) {
        console.warn('Direct API delivery failed, downgrading to PENDING and queuing for BLE:', apiErr);
        localMsg.status = 'PENDING';
        localMsg.is_synced = 0;
        await dbService.updateMessageStatus(localMsg.id, 'PENDING', false);
        this.enqueueBleRelay(localMsg);
        this.notifyMessageListeners(localMsg);
        return localMsg;
      }
    } else {
      // Offline mode: Queue for BLE mesh relay
      this.enqueueBleRelay(localMsg);
      return localMsg;
    }
  }

  /**
   * Sync all pending messages from SQLite to FastAPI backend /api/messages/sync
   */
  public async syncPendingMessages(): Promise<MessageResponse[]> {
    try {
      const pendingLocal = await dbService.getPendingMessages();
      if (!pendingLocal || pendingLocal.length === 0) {
        return [];
      }

      console.log(`Syncing ${pendingLocal.length} pending messages to FastAPI server...`);

      const messagesToSync: MessageCreate[] = pendingLocal.map((m) => ({
        id: m.id,
        recipient_id: m.recipient_id,
        encrypted_content: m.encrypted_content,
        encrypted_key: m.encrypted_key,
        iv: m.iv,
        content_type: m.content_type,
        priority: m.priority,
        hop_count: m.hop_count,
        max_hops: m.max_hops,
        ttl: m.ttl,
        expires_at: m.expires_at,
        created_at: m.created_at,
        gateway_device_id: m.gateway_device_id,
        route: m.route_json ? JSON.parse(m.route_json) : null
      }));

      const syncedResponses = await apiService.syncMessages(messagesToSync);

      // Update SQLite for each successfully synced message
      for (const res of syncedResponses) {
        await dbService.markMessageSynced(res.id, res.status);
        const updated = await dbService.getMessage(res.id);
        if (updated) {
          this.notifyMessageListeners(updated);
        }
        // Remove from BLE queue since it has reached the server
        this.dequeueBleRelay(res.id);
      }

      return syncedResponses;
    } catch (err) {
      console.error('Failed to sync pending messages:', err);
      return [];
    }
  }

  /**
   * Update message delivery status and propagate to SQLite and backend
   */
  public async acknowledgeMessage(
    messageId: string,
    status: 'DELIVERED' | 'READ' | string = 'DELIVERED'
  ): Promise<void> {
    await dbService.updateMessageStatus(messageId, status as MessageStatus);

    if (this.isOnline) {
      try {
        await apiService.acknowledgeMessage(messageId, status);
      } catch (err) {
        console.warn('Failed to send ack to API:', err);
      }
    }

    const msg = await dbService.getMessage(messageId);
    if (msg) {
      this.notifyMessageListeners(msg);
    }
  }

  /**
   * Handle incoming message from WebSocket or BLE mesh
   */
  public async handleIncomingMessage(
    msg: MessageResponse | LocalMessage,
    decryptedPlaintext?: string
  ): Promise<LocalMessage> {
    const localMsg: LocalMessage = {
      id: msg.id,
      sender_id: (msg as any).sender_id,
      recipient_id: msg.recipient_id,
      encrypted_content: msg.encrypted_content,
      encrypted_key: msg.encrypted_key || null,
      iv: msg.iv || null,
      content_type: msg.content_type || 'text',
      priority: msg.priority || 'normal',
      status: (msg as any).status || 'DELIVERED',
      hop_count: msg.hop_count || 0,
      max_hops: (msg as any).max_hops || 10,
      ttl: (msg as any).ttl || 86400,
      expires_at: (msg as any).expires_at || new Date(Date.now() + 86400000).toISOString(),
      created_at: msg.created_at || new Date().toISOString(),
      received_at: new Date().toISOString(),
      gateway_device_id: (msg as any).gateway_device_id || null,
      route_json: (msg as any).route ? JSON.stringify((msg as any).route) : null,
      is_synced: 1,
      plaintext: decryptedPlaintext
    };

    await dbService.saveMessage(localMsg);
    this.notifyMessageListeners(localMsg);
    return localMsg;
  }

  // ==========================================================================
  // BLE Relay Queue Management
  // ==========================================================================

  private enqueueBleRelay(msg: LocalMessage): void {
    const existingIdx = this.bleRelayQueue.findIndex((m) => m.id === msg.id);
    if (existingIdx >= 0) {
      this.bleRelayQueue[existingIdx] = msg;
    } else {
      this.bleRelayQueue.push(msg);
    }
    this.notifyBleQueueListeners();
  }

  private dequeueBleRelay(messageId: string): void {
    this.bleRelayQueue = this.bleRelayQueue.filter((m) => m.id !== messageId);
    this.notifyBleQueueListeners();
  }

  public getBleRelayQueue(): LocalMessage[] {
    return [...this.bleRelayQueue];
  }

  public onBleQueueUpdate(listener: (queue: LocalMessage[]) => void): () => void {
    this.bleQueueListeners.add(listener);
    listener([...this.bleRelayQueue]);
    return () => {
      this.bleQueueListeners.delete(listener);
    };
  }

  private notifyBleQueueListeners(): void {
    this.bleQueueListeners.forEach((l) => l([...this.bleRelayQueue]));
  }

  // ==========================================================================
  // Local Event Subscriptions
  // ==========================================================================

  public onMessageUpdate(listener: MessageEventListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  private notifyMessageListeners(message: LocalMessage): void {
    this.messageListeners.forEach((l) => {
      try {
        l(message);
      } catch (err) {
        console.error('Error in message listener:', err);
      }
    });
  }
}

export const messageService = MessageService.getInstance();
