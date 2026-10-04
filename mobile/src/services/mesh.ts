/**
 * MeshManager: decides how every message travels and runs the offline store-and-forward network.
 *
 *  Online                 -> REST to the server (instant push to the recipient over WebSocket)
 *  Recipient is nearby    -> straight to their phone (Nearby Connections, or BLE as fallback)
 *  Otherwise              -> stored, then carried phone-to-phone until it reaches the recipient
 *                            or any phone with internet (a "gateway") uploads it to the server
 *
 * Phones exchange JSON envelopes. When two phones link up they swap "hello"s (who they are,
 * whether they have internet), then a summary/want handshake so only missing packets are sent.
 * Message bodies are end-to-end encrypted before they enter the mesh.
 */

import { MESH } from '../config';
import { appEvents } from '../lib/events';
import { haversineMeters, rssiToMeters } from '../lib/format';
import { uuid } from '../lib/bytes';
import { reachablePeers, isReachable, useMeshStore, OwnSos } from '../store/useMeshStore';
import {
  AckPacket,
  ChatMessage,
  Contact,
  Envelope,
  HelloPayload,
  LinkType,
  MessageStatus,
  MsgPacket,
  Peer,
  QueueItem,
  RouteHop,
  SendMode,
  ServerMessage,
  SosPacket,
  Transport,
  User,
} from '../types';
import { api } from './api';
import { crypto } from './crypto';
import { database, STATUS_RANK } from './db';
import { device } from './device';
import { RelayScorer } from './relayScorer';
import { transport, PayloadEvent, PeerEvent, PeerFoundEvent } from './transport';

const PRIORITY = { normal: 0, ack: 5, critical: 100 };
const COUNTER_RELAYED = 'relayed_for_others';

const iso = (ms: number) => new Date(ms).toISOString();
const expiryFromNow = () => Date.now() + MESH.TTL_SECONDS * 1000;

class MeshManager {
  private me: User | null = null;
  private publicKey = '';
  private online = false;
  private battery = 100;
  private peers = new Map<string, Peer>(); // nodeId (BartaSetu ID) -> peer
  private linkToNode = new Map<string, string>(); // "nearby:<endpoint>" | "ble:<address>" -> nodeId
  private helloSentAt = new Map<string, number>();
  private unsubscribers: Array<() => void> = [];
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private pumping = false;
  private flushing = false;
  private radiosWanted = false;

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async start(user: User, publicKey: string): Promise<void> {
    this.me = user;
    this.publicKey = publicKey;
    this.battery = await device.batteryPercent();
    useMeshStore.getState().set({ meshSupported: transport.isAvailable() });

    if (this.unsubscribers.length === 0) {
      this.unsubscribers.push(
        transport.onPeerFound((e) => this.onPeerFound(e)),
        transport.onPeerConnected((e) => this.onPeerConnected(e)),
        transport.onPeerDisconnected((e) => this.onPeerDisconnected(e)),
        transport.onPeerLost((e) => this.onPeerLost(e)),
        transport.onPayload((e) => this.onPayload(e)),
        transport.onTransportState((s) => useMeshStore.getState().set({ nearbyActive: s.nearby, bleActive: s.ble })),
      );
    }

    if (!this.pumpTimer) {
      this.pumpTimer = setInterval(() => this.tick(), MESH.PUMP_INTERVAL_MS);
    }
    await this.refreshCounters();
  }

  /** Turn on the radios. Call after the user granted nearby permissions. */
  async startRadios(): Promise<void> {
    if (!this.me || !transport.isAvailable()) return;
    this.radiosWanted = true;
    try {
      const state = await transport.start(this.localInfo());
      useMeshStore.getState().set({ nearbyActive: state.nearby, bleActive: state.ble, permissionsGranted: true });
      debug(`radios started: nearby=${state.nearby} ble=${state.ble}`);
    } catch (err) {
      console.warn('[mesh] could not start radios', err);
    }
    await this.checkRadios();
    // Advertising/discovery confirm asynchronously; refresh the on-screen state shortly after
    setTimeout(() => void this.checkRadios(), 2500);
  }

  /**
   * Self-check: make sure Bluetooth advertising/scanning really are running (they stop when
   * Bluetooth or airplane mode is toggled) and show the true state on screen.
   */
  async checkRadios(): Promise<void> {
    if (!this.me || !this.radiosWanted) return;
    const s = await transport.ensureRunning();
    const store = useMeshStore.getState();
    if (store.nearbyActive !== s.nearby || store.bluetoothOn !== s.bluetoothOn) {
      debug(`radio check: nearby=${s.nearby} ble=${s.ble} bluetooth=${s.bluetoothOn}`);
    }
    store.set({ nearbyActive: s.nearby, bleActive: s.ble, bluetoothOn: s.bluetoothOn, backgroundAllowed: s.backgroundAllowed });
  }

  async stop(): Promise<void> {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    if (this.pumpTimer) clearInterval(this.pumpTimer);
    this.pumpTimer = null;
    await transport.stop();
    this.peers.clear();
    this.linkToNode.clear();
    this.helloSentAt.clear();
    this.radiosWanted = false;
    this.me = null;
    useMeshStore.getState().reset();
  }

  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    useMeshStore.getState().set({ online });
    if (!this.me) return;
    transport.updateLocalInfo(this.localInfo());
    // Tell linked phones we just became (or stopped being) a gateway
    debug(`internet ${online ? 'available' : 'lost'}`);
    this.reachable().forEach((p) => {
      if (this.shouldHello(p.nodeId, 3_000)) this.sendHello(p, true);
    });
    if (online) void this.syncWithServer();
  }

  isOnline(): boolean {
    return this.online;
  }

  private localInfo() {
    return { bsId: this.me!.bs_id, hasInternet: this.online, battery: this.battery };
  }

  private async tick(): Promise<void> {
    if (!this.me || !database.isOpen()) return;
    const expired = await database.purgeExpired();
    for (const id of expired) await this.setStatus(id, 'EXPIRED');

    const battery = await device.batteryPercent();
    if (Math.abs(battery - this.battery) >= 5) {
      this.battery = battery;
      transport.updateLocalInfo(this.localInfo());
    }

    this.expireBlePeers();
    await this.checkRadios();
    if (this.online) await this.flushUploads();
    await this.pump();
    await this.refreshCounters();
  }

  // ===========================================================================
  // Sending (called from the UI)
  // ===========================================================================

  async sendChat(contact: Contact, text: string, mode: SendMode): Promise<ChatMessage> {
    const me = this.requireMe();
    const target = await this.ensurePublicKey(contact);
    if (!target.publicKey) {
      throw new Error(`${contact.displayName} has not set up encryption yet. Try again when you are online, or when they are nearby.`);
    }

    const id = uuid();
    const now = Date.now();
    const packet: MsgPacket = {
      id,
      sender_id: me.id,
      sender_bs_id: me.bs_id,
      sender_name: me.display_name || me.username,
      sender_pub: this.publicKey,
      recipient_id: contact.userId,
      encrypted_content: crypto.encrypt(text, target.publicKey, id),
      priority: 'normal',
      hop_count: 0,
      max_hops: MESH.MAX_HOPS,
      ttl: MESH.TTL_SECONDS,
      expires_at: iso(expiryFromNow()),
      created_at: iso(now),
      route: [{ node: me.id, bsId: me.bs_id, hop: 0, action: 'ORIGIN', at: now }],
    };

    let message: ChatMessage = {
      id,
      peerId: contact.userId,
      senderId: me.id,
      recipientId: contact.userId,
      direction: 'out',
      body: text,
      status: 'PENDING',
      transport: mode === 'nearby' ? 'mesh' : 'internet',
      hopCount: 0,
      route: packet.route,
      priority: 'normal',
      createdAt: now,
      updatedAt: now,
    };
    await database.saveMessage(message);
    await database.markSeen(id);
    this.notifyMessage(message);

    const queueItem = { id, kind: 'msg' as const, packet, priority: PRIORITY.normal, isOwn: true, sendMode: mode, sourceNode: null };

    // 1. Recipient is right here: hand it over directly over Bluetooth / Wi-Fi.
    //    Done first even when we have internet, because the recipient may not.
    if (mode !== 'internet') {
      const recipientPeer = this.findPeerByUser(contact.userId);
      if (recipientPeer && isReachable(recipientPeer)) {
        await this.enqueue(queueItem);
        const item = await database.getQueueItem(id);
        const sent = item ? await this.sendEnvelope(recipientPeer, { v: 1, t: 'msg', from: me.bs_id, packet }) : false;
        debug(`direct send to ${recipientPeer.nodeId}: ${sent ? 'ok' : 'failed'}`);
        if (item && sent) {
          await this.afterHandoff(item, recipientPeer);
          return (await database.getMessage(id)) ?? message;
        }
      }
    }

    // 2. Through the server
    if (mode !== 'nearby' && this.online) {
      try {
        await api.sendMessage(packet);
        await database.dequeue(id);
        return (await this.setStatus(id, 'SERVER_RECEIVED', { transport: 'internet' })) ?? message;
      } catch (err) {
        console.warn('[mesh] upload failed, falling back to nearby phones', err);
      }
    }

    // 3. Internet-only: wait in the outbox until we are back online
    if (mode === 'internet') {
      await this.enqueue(queueItem);
      return message;
    }

    // 4. Store and forward through nearby phones
    await this.enqueue(queueItem);
    message = (await this.setStatus(id, 'STORED', { transport: 'mesh' })) ?? message;
    debug(`stored ${id.slice(0, 8)} for the mesh (${this.reachable().length} phones in range)`);
    void this.pump();
    return message;
  }

  async sendSos(category: string, note: string): Promise<OwnSos> {
    const me = this.requireMe();
    const location = await device.preciseLocation();
    const battery = await device.batteryPercent();
    const now = Date.now();
    const packet: SosPacket = {
      id: uuid(),
      user_id: me.id,
      bs_id: me.bs_id,
      name: me.display_name || me.username,
      message: note,
      category,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      battery,
      hop_count: 0,
      max_hops: MESH.MAX_HOPS,
      expires_at: iso(now + 6 * 60 * 60 * 1000),
      created_at: iso(now),
    };
    await database.markSeen(packet.id);

    const sos: OwnSos = {
      id: packet.id,
      category,
      createdAt: now,
      state: 'sending',
      sharedWith: 0,
      hasLocation: location != null,
    };
    useMeshStore.getState().set({ lastSos: sos });

    if (this.online) {
      try {
        await api.createSos(sosApiPayload(packet));
        await database.incrementCounter(sosUploadedKey(packet.id));
        sos.state = 'server';
      } catch (err) {
        console.warn('[mesh] SOS upload failed, using mesh', err);
      }
    }

    // Always alert the phones around us too (they also upload it if they have internet)
    await this.enqueue({ id: packet.id, kind: 'sos', packet, priority: PRIORITY.critical, isOwn: true, sendMode: 'auto', sourceNode: null });
    if (sos.state !== 'server') sos.state = this.reachable().length > 0 ? 'mesh' : 'waiting';
    this.log(`You sent an SOS (${category})`);
    await this.pump();
    useMeshStore.getState().set({ lastSos: { ...sos } });
    return sos;
  }

  // ===========================================================================
  // Server sync (gateway role + catching up after being offline)
  // ===========================================================================

  async syncWithServer(): Promise<void> {
    if (!this.me || !this.online || !database.isOpen()) return;
    await this.flushUploads();

    try {
      for (const msg of await api.inbox()) await this.handleServerMessage(msg);
    } catch (err) {
      console.warn('[mesh] inbox fetch failed', err);
    }

    try {
      const pending = await database.getUnconfirmedOutgoing();
      const statuses = await api.statuses(pending.filter((m) => m.status !== 'PENDING' && m.status !== 'STORED').map((m) => m.id));
      for (const s of statuses) await this.setStatus(s.id, s.status as MessageStatus);
    } catch (err) {
      console.warn('[mesh] status sync failed', err);
    }
    await this.refreshCounters();
  }

  /** Upload everything the internet can take: our outbox and packets carried for others. */
  async flushUploads(): Promise<void> {
    if (!this.me || !this.online || this.flushing) return;
    this.flushing = true;
    try {
      const queue = await database.getQueue();

      for (const item of queue.filter((q) => q.kind === 'msg' && q.isOwn && q.sendMode !== 'nearby')) {
        try {
          await api.sendMessage(item.packet as MsgPacket);
          await database.dequeue(item.id);
          await this.setStatus(item.id, 'SERVER_RECEIVED', { transport: 'internet' });
        } catch (err) {
          const status = (err as { response?: { status?: number } }).response?.status;
          if (status && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
            // Rejected for good (e.g. recipient account deleted)
            await database.dequeue(item.id);
            await this.setStatus(item.id, 'FAILED');
            continue;
          }
          break; // server unreachable; try again later
        }
      }

      const carried = queue.filter((q) => q.kind === 'msg' && !q.isOwn);
      if (carried.length > 0) {
        try {
          const stored = await api.syncRelayed(carried.map((q) => q.packet as MsgPacket), this.me.id);
          const storedIds = new Set(stored.map((m) => m.id));
          for (const item of carried) {
            await database.dequeue(item.id);
            if (!storedIds.has(item.id)) continue;
            await database.incrementCounter(COUNTER_RELAYED);
            // Let the (possibly still offline) sender know their message reached the server
            const msg = item.packet as MsgPacket;
            await this.enqueueAck(msg.id, 'SERVER_RECEIVED', msg.sender_id);
          }
        } catch (err) {
          console.warn('[mesh] gateway upload failed', err);
        }
      }

      const deliveredAcks = queue.filter((q) => q.kind === 'ack' && (q.packet as AckPacket).status === 'DELIVERED');
      if (deliveredAcks.length > 0) {
        try {
          await api.syncAcks(deliveredAcks.map((q) => {
            const ack = q.packet as AckPacket;
            return { message_id: ack.message_id, recipient_id: ack.from, status: ack.status };
          }));
          for (const item of deliveredAcks) await database.dequeue(item.id);
        } catch (err) {
          console.warn('[mesh] ack upload failed', err);
        }
      }

      const alerts = queue.filter((q) => q.kind === 'sos');
      for (const item of alerts) {
        const sos = item.packet as SosPacket;
        if (await database.getCounter(sosUploadedKey(sos.id))) continue;
        try {
          if (item.isOwn) await api.createSos(sosApiPayload(sos));
          else await api.syncSos([{ ...sosApiPayload(sos), user_id: sos.user_id }]);
          // Not dequeued: it keeps spreading to nearby phones until it expires
          await database.incrementCounter(sosUploadedKey(sos.id));
          if (item.isOwn) this.updateOwnSos(sos.id, { state: 'server' });
          else this.log(`Uploaded ${sos.name}'s SOS to the server`);
        } catch {
          break;
        }
      }
    } finally {
      this.flushing = false;
      await this.refreshCounters();
    }
  }

  /** A message pushed over WebSocket or fetched from the inbox. */
  async handleServerMessage(msg: ServerMessage): Promise<void> {
    const me = this.me;
    if (!me || msg.recipient_id !== me.id || !database.isOpen()) return;

    if (await database.getMessage(msg.id)) {
      void api.ack(msg.id).catch(() => undefined);
      return;
    }
    await database.markSeen(msg.id);

    let contact = await database.getContact(msg.sender_id);
    if (!contact?.publicKey) contact = await this.fetchContact(msg.sender_id);
    let body = contact?.publicKey ? crypto.decrypt(msg.encrypted_content, contact.publicKey, msg.id) : null;
    if (body == null && contact?.publicKey) {
      // Our copy of their key may be stale (they reinstalled); fetch the current one and retry
      const fresh = await this.fetchContact(msg.sender_id);
      if (fresh?.publicKey && fresh.publicKey !== contact.publicKey) {
        body = crypto.decrypt(msg.encrypted_content, fresh.publicKey, msg.id);
      }
    }

    const createdAt = msg.created_at ? Date.parse(msg.created_at) || Date.now() : Date.now();
    const message: ChatMessage = {
      id: msg.id,
      peerId: msg.sender_id,
      senderId: msg.sender_id,
      recipientId: me.id,
      direction: 'in',
      body,
      status: 'DELIVERED',
      transport: msg.hop_count > 0 ? 'mesh' : 'internet',
      hopCount: msg.hop_count,
      route: [],
      priority: msg.priority === 'critical' ? 'critical' : 'normal',
      createdAt,
      updatedAt: Date.now(),
    };
    await database.saveMessage(message);
    this.notifyMessage(message);
    appEvents.emit('incomingMessage', { peerId: msg.sender_id, name: contact?.displayName ?? 'New message', body });
    try {
      await api.ack(msg.id);
    } catch {
      await this.enqueueAck(msg.id, 'DELIVERED', msg.sender_id);
    }
  }

  /** SOS broadcast by the server over WebSocket. Shown when the person is within 10 km (or position unknown). */
  async handleServerSos(alert: {
    id: string;
    user_id: string;
    message?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    battery_level?: number | null;
    created_at?: string | null;
  }): Promise<void> {
    const me = this.me;
    if (!me || alert.user_id === me.id || !database.isOpen()) return;
    if (await database.isSeen(alert.id)) return;
    await database.markSeen(alert.id);

    const here = device.lastKnownLocation();
    if (here && alert.latitude != null && alert.longitude != null) {
      const meters = haversineMeters(here.latitude, here.longitude, alert.latitude, alert.longitude);
      if (meters > 10_000) return;
    }

    const contact = (await database.getContact(alert.user_id)) ?? (await this.fetchContact(alert.user_id));
    const raw = alert.message ?? 'I need help';
    const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
    const entry = {
      id: alert.id,
      name: contact?.displayName ?? 'A BartaSetu user',
      bsId: contact?.bsId ?? '',
      message: match ? match[2] || 'I need help' : raw,
      category: match ? match[1] : 'Emergency',
      latitude: alert.latitude ?? null,
      longitude: alert.longitude ?? null,
      battery: alert.battery_level ?? null,
      receivedAt: Date.now(),
      hopCount: 0,
    };
    const store = useMeshStore.getState();
    store.set({ nearbyAlerts: [entry, ...store.nearbyAlerts.filter((a) => a.id !== entry.id)].slice(0, 20), incomingSos: entry });
    appEvents.emit('sosReceived');
    this.log(`SOS from ${entry.name} (via server)`);
    transport.notify('sos', `SOS from ${entry.name} - ${entry.category}`, entry.message);
  }

  async handleServerAck(messageId: string, status: string): Promise<void> {
    if (!database.isOpen()) return;
    await this.setStatus(messageId, status as MessageStatus);
  }

  // ===========================================================================
  // Native transport events
  // ===========================================================================

  /** Discovery data is only a hint; once a phone said hello, its hello is the source of truth. */
  private discoveryPatch(existing: Peer | undefined, e: PeerFoundEvent): Partial<Peer> {
    if (existing?.userId) return {};
    return {
      ...(e.hasInternet != null ? { hasInternet: e.hasInternet } : {}),
      ...(e.battery != null ? { battery: e.battery } : {}),
    };
  }

  private onPeerFound(e: PeerFoundEvent): void {
    if (!e.bsId || e.bsId === this.me?.bs_id) return;
    const isNew = !this.peers.has(e.bsId);
    const peer = this.upsertPeer(e.bsId, this.discoveryPatch(this.peers.get(e.bsId), e));
    this.linkToNode.set(`${e.transport}:${e.peerId}`, e.bsId);
    if (e.transport === 'nearby') {
      peer.nearbyEndpoint = e.peerId;
      if (!peer.nearbyConnected) this.log(`Found ${e.bsId} nearby, connecting...`);
    } else {
      const now = Date.now();
      peer.bleAddress = e.peerId;
      peer.bleSeenAt = now;
      peer.bleFirstSeen ??= now;
      if (e.rssi != null) {
        peer.rssi = e.rssi;
        peer.distanceMeters = rssiToMeters(e.rssi);
      }
      if (isNew) this.log(`Found ${e.bsId} over Bluetooth LE`);
      // BLE is the fallback: only talk over it when Nearby is off on this phone, or Nearby has
      // not seen that phone within 20 s. Extra GATT connections disturb Nearby's own links.
      const nearbyOn = useMeshStore.getState().nearbyActive;
      const useBle = !peer.nearbyConnected && (!nearbyOn || (!peer.nearbyEndpoint && now - peer.bleFirstSeen > 20_000));
      if (useBle && this.shouldHello(peer.nodeId, 60_000)) this.sendHello(peer, false);
      else if (useBle && peer.userId) void this.offerTo(peer);
    }
    this.publishPeers();
  }

  private onPeerConnected(e: PeerFoundEvent): void {
    const nodeId = e.bsId && e.bsId !== 'BS-UNKNOWN' ? e.bsId : this.linkToNode.get(`nearby:${e.peerId}`);
    if (!nodeId) return;
    const peer = this.upsertPeer(nodeId, this.discoveryPatch(this.peers.get(nodeId), e));
    peer.nearbyEndpoint = e.peerId;
    peer.nearbyConnected = true;
    this.linkToNode.set(`nearby:${e.peerId}`, nodeId);
    this.log(`Connected to ${nodeId}`);
    this.publishPeers();
    this.sendHello(peer, false);
  }

  private onPeerDisconnected(e: PeerEvent): void {
    const nodeId = this.linkToNode.get(`${e.transport}:${e.peerId}`);
    const peer = nodeId ? this.peers.get(nodeId) : undefined;
    if (!peer) return;
    peer.nearbyConnected = false;
    this.helloSentAt.delete(peer.nodeId);
    this.log(`Disconnected from ${peer.displayName ?? peer.nodeId}`);
    this.publishPeers();
  }

  private onPeerLost(e: PeerEvent): void {
    const key = `${e.transport}:${e.peerId}`;
    const nodeId = this.linkToNode.get(key);
    this.linkToNode.delete(key);
    const peer = nodeId ? this.peers.get(nodeId) : undefined;
    if (!peer) return;
    if (e.transport === 'nearby' && !peer.nearbyConnected) peer.nearbyEndpoint = undefined;
    if (e.transport === 'ble') {
      peer.bleAddress = undefined;
      peer.bleSeenAt = undefined;
    }
    if (!peer.nearbyEndpoint && !peer.bleAddress) this.peers.delete(peer.nodeId);
    this.publishPeers();
  }

  private async onPayload(e: PayloadEvent): Promise<void> {
    if (!this.me || !database.isOpen()) return;
    let env: Envelope;
    try {
      env = JSON.parse(e.data);
    } catch {
      return;
    }
    if (env?.v !== 1 || !env.from || env.from === this.me.bs_id) return;
    debug(`<- ${env.t} from ${env.from} via ${e.transport}${'ids' in env ? ` (${env.ids.length} ids)` : ''}`);

    // Payloads identify their sender, so map this link to the right phone
    const peer = this.upsertPeer(env.from, {});
    this.linkToNode.set(`${e.transport}:${e.peerId}`, env.from);
    if (e.transport === 'nearby') {
      peer.nearbyEndpoint = e.peerId;
      peer.nearbyConnected = true;
    } else if (!peer.bleAddress) {
      peer.bleAddress = e.peerId;
      peer.bleSeenAt = Date.now();
    }
    peer.lastSeen = Date.now();

    try {
      switch (env.t) {
        case 'hello':
          await this.onHello(peer, env.hello, Boolean(env.reply));
          break;
        case 'summary': {
          // Always answer (even with an empty list) so the other phone stops offering what we have
          const want = await database.filterUnseen(env.ids);
          await this.sendEnvelope(peer, { v: 1, t: 'want', from: this.me.bs_id, ids: want, offered: env.ids });
          break;
        }
        case 'want': {
          // Anything offered but not wanted is already on that phone: never offer it again
          const wanted = new Set(env.ids);
          for (const id of env.offered ?? []) {
            if (!wanted.has(id)) await database.recordRelay(id, peer.nodeId, false);
          }
          await this.sendWanted(peer, env.ids);
          break;
        }
        case 'msg':
          await this.onMsgPacket(peer, env.packet, e.transport);
          break;
        case 'ack':
          await this.onAckPacket(peer, env.packet);
          break;
        case 'sos':
          await this.onSosPacket(peer, env.packet);
          break;
      }
    } catch (err) {
      console.warn(`[mesh] failed to handle ${env.t} from ${env.from}`, err);
    }
    this.publishPeers();
  }

  // ===========================================================================
  // Protocol handlers
  // ===========================================================================

  private async onHello(peer: Peer, hello: HelloPayload, isReply: boolean): Promise<void> {
    if (!peer.userId) {
      this.log(`${hello.displayName} (${hello.bsId}) is ready to chat${hello.hasInternet ? ' - has internet' : ''}`);
    }
    peer.userId = hello.userId;
    peer.displayName = hello.displayName;
    peer.publicKey = hello.publicKey;
    peer.hasInternet = hello.hasInternet;
    peer.battery = hello.battery;
    peer.lat = hello.lat ?? null;
    peer.lon = hello.lon ?? null;
    const here = device.lastKnownLocation();
    if (here && hello.lat != null && hello.lon != null) {
      peer.distanceMeters = haversineMeters(here.latitude, here.longitude, hello.lat, hello.lon);
    }

    // Remember them so we can chat (and decrypt their messages) without internet.
    // A key we already have (e.g. verified by the server) is never replaced by a mesh claim.
    const existing = await database.getContact(hello.userId);
    await database.upsertContact({
      userId: hello.userId,
      bsId: hello.bsId,
      displayName: existing?.displayName || hello.displayName,
      publicKey: existing?.publicKey || hello.publicKey,
      lastSeenNearby: Date.now(),
    });
    appEvents.emit('contactsChanged');

    debug(`hello from ${hello.bsId} (${hello.displayName}), internet=${hello.hasInternet}`);
    if (!isReply && this.shouldHello(peer.nodeId, 5_000)) this.sendHello(peer, true);
    await this.offerTo(peer);
  }

  private async onMsgPacket(from: Peer, packet: MsgPacket, link: LinkType): Promise<void> {
    const me = this.me!;
    if (await database.isSeen(packet.id)) {
      // We already have it. If it was for us, the sender may have missed our ack.
      if (packet.recipient_id === me.id) await this.enqueueAck(packet.id, 'DELIVERED', packet.sender_id);
      return;
    }
    await database.markSeen(packet.id);

    const hop = packet.hop_count + 1;
    const isForMe = packet.recipient_id === me.id;
    const route: RouteHop[] = [
      ...(packet.route || []),
      { node: me.id, bsId: me.bs_id, hop, action: isForMe ? 'RECIPIENT' : this.online ? 'GATEWAY' : 'RELAY', at: Date.now() },
    ];
    const updated: MsgPacket = { ...packet, hop_count: hop, route };

    if (isForMe) {
      await this.deliverToMe(updated, hop === 1 ? 'direct' : 'mesh');
      return;
    }
    if (Date.parse(packet.expires_at) < Date.now()) return;

    await this.enqueue({
      id: packet.id, kind: 'msg', packet: updated, priority: PRIORITY.normal,
      isOwn: false, sendMode: 'auto', sourceNode: from.nodeId,
    });
    // As a gateway, upload first; then pass on whatever is still queued
    // (including the "reached the server" receipt for the offline sender)
    if (this.online) await this.flushUploads();
    void this.pump();
  }

  private async deliverToMe(packet: MsgPacket, via: Transport): Promise<void> {
    const me = this.me!;
    const existing = await database.getContact(packet.sender_id);
    const contact = await database.upsertContact({
      userId: packet.sender_id,
      bsId: packet.sender_bs_id,
      displayName: existing?.displayName || packet.sender_name,
      publicKey: existing?.publicKey || packet.sender_pub,
    });
    appEvents.emit('contactsChanged');

    let body = contact.publicKey ? crypto.decrypt(packet.encrypted_content, contact.publicKey, packet.id) : null;
    if (body == null && packet.sender_pub && packet.sender_pub !== contact.publicKey) {
      // The sender may have reinstalled the app and has a new key
      body = crypto.decrypt(packet.encrypted_content, packet.sender_pub, packet.id);
    }

    const message: ChatMessage = {
      id: packet.id,
      peerId: packet.sender_id,
      senderId: packet.sender_id,
      recipientId: me.id,
      direction: 'in',
      body,
      status: 'DELIVERED',
      transport: via,
      hopCount: packet.hop_count,
      route: packet.route,
      priority: packet.priority,
      createdAt: Date.parse(packet.created_at) || Date.now(),
      updatedAt: Date.now(),
    };
    await database.saveMessage(message);
    this.notifyMessage(message);
    appEvents.emit('incomingMessage', { peerId: packet.sender_id, name: contact.displayName, body });
    this.log(`Message from ${contact.displayName} arrived ${via === 'direct' ? 'directly' : `via ${packet.hop_count} hops`}`);

    if (this.online) {
      try {
        await api.ack(packet.id);
        return;
      } catch {
        // fall through to a mesh ack
      }
    }
    await this.enqueueAck(packet.id, 'DELIVERED', packet.sender_id);
    void this.pump();
  }

  private async onAckPacket(from: Peer, ack: AckPacket): Promise<void> {
    if (await database.isSeen(ack.id)) return;
    await database.markSeen(ack.id);

    if (ack.to === this.me!.id) {
      await this.setStatus(ack.message_id, ack.status);
      return;
    }
    if (Date.parse(ack.expires_at) < Date.now() || ack.hop_count + 1 >= ack.max_hops) return;
    await this.enqueue({
      id: ack.id, kind: 'ack', packet: { ...ack, hop_count: ack.hop_count + 1 }, priority: PRIORITY.ack,
      isOwn: false, sendMode: 'auto', sourceNode: from.nodeId,
    });
    if (this.online && ack.status === 'DELIVERED') await this.flushUploads();
    else void this.pump();
  }

  private async onSosPacket(from: Peer, sos: SosPacket): Promise<void> {
    if (await database.isSeen(sos.id)) return;
    await database.markSeen(sos.id);

    if (sos.user_id !== this.me!.id) {
      const store = useMeshStore.getState();
      store.set({
        nearbyAlerts: [
          {
            id: sos.id, name: sos.name, bsId: sos.bs_id, message: sos.message, category: sos.category,
            latitude: sos.latitude, longitude: sos.longitude, battery: sos.battery,
            receivedAt: Date.now(), hopCount: sos.hop_count + 1,
          },
          ...store.nearbyAlerts.filter((a) => a.id !== sos.id),
        ].slice(0, 20),
      });
      appEvents.emit('sosReceived');
      useMeshStore.getState().set({ incomingSos: useMeshStore.getState().nearbyAlerts[0] ?? null });
      this.log(`SOS from ${sos.name}: ${sos.category}`);
      const where = sos.latitude != null && sos.longitude != null
        ? ` (${sos.latitude.toFixed(4)}, ${sos.longitude.toFixed(4)})` : '';
      transport.notify('sos', `SOS from ${sos.name} - ${sos.category}`, `${sos.message}${where}`);
    }

    if (Date.parse(sos.expires_at) < Date.now() || sos.hop_count + 1 >= sos.max_hops) return;
    await this.enqueue({
      id: sos.id, kind: 'sos', packet: { ...sos, hop_count: sos.hop_count + 1 }, priority: PRIORITY.critical,
      isOwn: false, sendMode: 'auto', sourceNode: from.nodeId,
    });
    if (this.online) await this.flushUploads();
    await this.pump();
  }

  // ===========================================================================
  // Store-and-forward
  // ===========================================================================

  /** Offer queued packets to every phone we can currently reach. */
  async pump(): Promise<void> {
    if (!this.me || this.pumping || !database.isOpen()) return;
    this.pumping = true;
    try {
      for (const peer of this.reachable()) {
        if (peer.userId) await this.offerTo(peer);
      }
    } finally {
      this.pumping = false;
      await this.refreshCounters();
    }
  }

  /** Send a summary of the packets this phone should receive; it replies with the ones it lacks. */
  private async offerTo(peer: Peer): Promise<void> {
    if (!this.me || !peer.userId || !isReachable(peer)) return;
    const now = Date.now();
    const queue = await database.getQueue();
    const ids: string[] = [];
    for (const item of queue) {
      if (item.expiresAt < now || item.sourceNode === peer.nodeId) continue;
      const relayedTo = await database.relayedTo(item.id);
      if (relayedTo.includes(peer.nodeId)) continue;
      if (this.isGoodNextHop(item, peer, relayedTo)) ids.push(item.id);
    }
    if (ids.length > 0) {
      await this.sendEnvelope(peer, { v: 1, t: 'summary', from: this.me.bs_id, ids });
    }
  }

  /**
   * Smart routing: always hand a packet to its recipient or to a phone with internet;
   * otherwise only to the best few relay candidates (ranked by RelayScorer), not to everyone.
   * SOS alerts are the exception and go to every nearby phone.
   */
  private isGoodNextHop(item: QueueItem, peer: Peer, relayedTo: string[]): boolean {
    if (item.kind === 'sos') return true;
    if (item.kind === 'msg') {
      const packet = item.packet as MsgPacket;
      if (item.isOwn && item.sendMode === 'internet') return false;
      if (packet.recipient_id === peer.userId) return true;
      if (packet.hop_count + 1 >= packet.max_hops) return false;
      if (peer.hasInternet) return true;
    } else {
      const ack = item.packet as AckPacket;
      if (ack.to === peer.userId) return true;
      // Gateways can upload delivery receipts; other status updates only travel phone-to-phone
      if (peer.hasInternet && ack.status === 'DELIVERED') return true;
    }

    const relayCopies = relayedTo.filter((nodeId) => !this.peers.get(nodeId)?.hasInternet).length;
    if (relayCopies >= MESH.MAX_RELAY_COPIES) return false;
    return this.topRelays(item.sourceNode).includes(peer.nodeId);
  }

  private topRelays(excludeNode: string | null, count = 2): string[] {
    const candidates = this.reachable().filter((p) => p.nodeId !== excludeNode && p.userId && !p.hasInternet);
    return candidates
      .map((p) => ({
        nodeId: p.nodeId,
        score: RelayScorer.calculateRelayScore({
          deviceId: p.nodeId,
          hasInternet: p.hasInternet,
          rssi: p.rssi ?? (p.nearbyConnected ? -60 : -75),
          distanceMeters: p.distanceMeters ?? 20,
          batteryLevel: p.battery,
          previousSuccessRate: Math.min(1, 0.6 + p.relayedCount * 0.05),
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((c) => c.nodeId);
  }

  private async sendWanted(peer: Peer, ids: string[]): Promise<void> {
    const me = this.me!;
    const items = (await Promise.all(ids.map((id) => database.getQueueItem(id)))).filter(Boolean) as QueueItem[];
    items.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    for (const item of items) {
      const env: Envelope =
        item.kind === 'msg' ? { v: 1, t: 'msg', from: me.bs_id, packet: item.packet as MsgPacket }
        : item.kind === 'ack' ? { v: 1, t: 'ack', from: me.bs_id, packet: item.packet as AckPacket }
        : { v: 1, t: 'sos', from: me.bs_id, packet: item.packet as SosPacket };
      if (await this.sendEnvelope(peer, env)) await this.afterHandoff(item, peer);
    }
  }

  private async afterHandoff(item: QueueItem, peer: Peer): Promise<void> {
    await database.recordRelay(item.id, peer.nodeId, peer.hasInternet);
    const what = item.kind === 'sos' ? 'SOS' : item.kind === 'ack' ? 'Receipt' : item.isOwn ? 'Your message' : 'A message';
    this.log(`${what} passed to ${peer.displayName ?? peer.nodeId}${peer.hasInternet ? ' (has internet)' : ''}`);
    peer.relayedCount += 1;
    if (!item.isOwn && item.kind !== 'ack') await database.incrementCounter(COUNTER_RELAYED);

    const handedToRecipient =
      (item.kind === 'msg' && (item.packet as MsgPacket).recipient_id === peer.userId) ||
      (item.kind === 'ack' && (item.packet as AckPacket).to === peer.userId);

    if (item.kind === 'msg' && item.isOwn) {
      if (handedToRecipient) await this.setStatus(item.id, 'RELAYED', { transport: (item.packet as MsgPacket).hop_count === 0 ? 'direct' : 'mesh' });
      else if (peer.hasInternet) await this.setStatus(item.id, 'GATEWAY_REACHED', { transport: 'mesh' });
      else await this.setStatus(item.id, 'RELAYED', { transport: 'mesh' });
    }
    if (item.kind === 'sos' && item.isOwn) {
      const shared = (await database.relayedTo(item.id)).length;
      this.updateOwnSos(item.id, { state: 'mesh', sharedWith: shared });
    }

    // Recipient or a gateway that will upload it has it: no need to keep offering it
    const gatewayWillUpload =
      peer.hasInternet &&
      (item.kind === 'msg' || (item.kind === 'ack' && (item.packet as AckPacket).status === 'DELIVERED'));
    if (handedToRecipient || gatewayWillUpload) await database.dequeue(item.id);
  }

  private async enqueue(item: Omit<QueueItem, 'expiresAt' | 'createdAt'> & { expiresAt?: number; createdAt?: number }) {
    const packet = item.packet as { expires_at?: string; created_at?: string };
    await database.enqueue({
      ...item,
      expiresAt: item.expiresAt ?? (packet.expires_at ? Date.parse(packet.expires_at) : expiryFromNow()),
      createdAt: item.createdAt ?? (packet.created_at ? Date.parse(packet.created_at) : Date.now()),
    });
    await this.refreshCounters();
  }

  private async enqueueAck(messageId: string, status: MessageStatus, to: string): Promise<void> {
    const now = Date.now();
    const ack: AckPacket = {
      id: `ack-${status}-${messageId}`,
      message_id: messageId,
      status,
      from: this.me!.id,
      to,
      hop_count: 0,
      max_hops: MESH.MAX_HOPS,
      expires_at: iso(expiryFromNow()),
      created_at: iso(now),
    };
    if (await database.isSeen(ack.id)) return;
    await database.markSeen(ack.id);
    await this.enqueue({ id: ack.id, kind: 'ack', packet: ack, priority: PRIORITY.ack, isOwn: true, sendMode: 'auto', sourceNode: null });
  }

  // ===========================================================================
  // Links
  // ===========================================================================

  private async sendEnvelope(peer: Peer, env: Envelope): Promise<boolean> {
    const data = JSON.stringify(env);
    let ok = false;
    let link = 'none';
    if (peer.nearbyConnected && peer.nearbyEndpoint) {
      link = 'nearby';
      ok = await transport.send(peer.nearbyEndpoint, 'nearby', data);
    }
    if (!ok && peer.bleAddress && peer.bleSeenAt && Date.now() - peer.bleSeenAt < MESH.BLE_PEER_TTL_MS) {
      link = 'ble';
      ok = await transport.send(peer.bleAddress, 'ble', data);
    }
    debug(`-> ${env.t} to ${peer.nodeId} via ${link}: ${ok ? 'ok' : 'FAILED'}${'ids' in env ? ` (${env.ids.length} ids)` : ''}`);
    return ok;
  }

  private sendHello(peer: Peer, reply: boolean): void {
    const me = this.me;
    if (!me) return;
    this.helloSentAt.set(peer.nodeId, Date.now());
    const here = device.lastKnownLocation();
    const hello: HelloPayload = {
      userId: me.id,
      bsId: me.bs_id,
      displayName: me.display_name || me.username,
      publicKey: this.publicKey,
      hasInternet: this.online,
      battery: this.battery,
      lat: here?.latitude ?? null,
      lon: here?.longitude ?? null,
    };
    void this.sendEnvelope(peer, { v: 1, t: 'hello', from: me.bs_id, hello, reply });
  }

  private shouldHello(nodeId: string, minIntervalMs: number): boolean {
    const last = this.helloSentAt.get(nodeId) ?? 0;
    return Date.now() - last > minIntervalMs;
  }

  private upsertPeer(nodeId: string, patch: Partial<Peer>): Peer {
    let peer = this.peers.get(nodeId);
    if (!peer) {
      peer = {
        nodeId, bsId: nodeId, hasInternet: false, battery: 100, nearbyConnected: false,
        lastSeen: Date.now(), relayedCount: 0,
      };
      this.peers.set(nodeId, peer);
    }
    Object.assign(peer, patch, { lastSeen: Date.now() });
    return peer;
  }

  private expireBlePeers(): void {
    const now = Date.now();
    let changed = false;
    for (const peer of this.peers.values()) {
      if (!peer.nearbyConnected && !peer.nearbyEndpoint && peer.bleSeenAt && now - peer.bleSeenAt > MESH.BLE_PEER_TTL_MS * 2) {
        this.peers.delete(peer.nodeId);
        changed = true;
      }
    }
    if (changed) this.publishPeers();
  }

  private reachable(): Peer[] {
    return reachablePeers(Object.fromEntries(this.peers));
  }

  findPeerByUser(userId: string): Peer | undefined {
    for (const peer of this.peers.values()) if (peer.userId === userId) return peer;
    return undefined;
  }

  private publishPeers(): void {
    useMeshStore.getState().set({ peers: Object.fromEntries([...this.peers].map(([k, v]) => [k, { ...v }])) });
    appEvents.emit('peersChanged');
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** Short human-readable activity line shown on the Nearby screen. */
  private log(text: string): void {
    const store = useMeshStore.getState();
    store.set({ activity: [{ at: Date.now(), text }, ...store.activity].slice(0, 40) });
  }

  private requireMe(): User {
    if (!this.me) throw new Error('Not signed in');
    return this.me;
  }

  private async ensurePublicKey(contact: Contact): Promise<Contact> {
    if (contact.publicKey) return contact;
    const peer = this.findPeerByUser(contact.userId);
    if (peer?.publicKey) {
      return database.upsertContact({ ...contact, publicKey: peer.publicKey });
    }
    if (this.online) return (await this.fetchContact(contact.userId)) ?? contact;
    return contact;
  }

  private async fetchContact(userId: string): Promise<Contact | null> {
    try {
      const user = await api.getUser(userId);
      const contact = await database.upsertContact({
        userId: user.id,
        bsId: user.bs_id ?? '',
        displayName: user.display_name || user.username,
        username: user.username,
        publicKey: user.public_key ?? undefined,
      });
      appEvents.emit('contactsChanged');
      return contact;
    } catch {
      return database.getContact(userId);
    }
  }

  private async setStatus(id: string, status: MessageStatus, extra: { transport?: Transport } = {}): Promise<ChatMessage | null> {
    if (!(status in STATUS_RANK)) return null;
    const updated = await database.updateStatus(id, status, extra);
    if (updated) this.notifyMessage(updated);
    return updated;
  }

  private notifyMessage(message: ChatMessage): void {
    appEvents.emit('messageChanged', { peerId: message.peerId, messageId: message.id });
  }

  private updateOwnSos(id: string, patch: Partial<OwnSos>): void {
    const store = useMeshStore.getState();
    if (store.lastSos?.id === id) store.set({ lastSos: { ...store.lastSos, ...patch } });
  }

  private async refreshCounters(): Promise<void> {
    if (!database.isOpen()) return;
    const [ownQueued, carrying, relayedForOthers] = await Promise.all([
      database.queueSize('own-messages'),
      database.queueSize('carried'),
      database.getCounter(COUNTER_RELAYED),
    ]);
    useMeshStore.getState().set({ ownQueued, carrying, relayedForOthers });
  }
}

const sosUploadedKey = (id: string) => `sos_uploaded_${id}`;

/** Mesh diagnostics; visible with `adb logcat -s ReactNativeJS`. */
function debug(text: string): void {
  console.log(`[mesh] ${text}`);
}

function sosApiPayload(sos: SosPacket) {
  return {
    id: sos.id,
    message: `[${sos.category}] ${sos.message}`.trim(),
    latitude: sos.latitude,
    longitude: sos.longitude,
    battery_level: sos.battery,
  };
}

export const mesh = new MeshManager();
