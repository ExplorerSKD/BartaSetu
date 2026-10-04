/**
 * Local SQLite storage (one database per signed-in account).
 *
 * messages      - this account's conversations (plaintext only ever stored on this phone)
 * contacts      - people found by BartaSetu ID or met over the mesh, with their public keys
 * relay_queue   - packets waiting to move on: our own offline messages and ones carried for others
 * seen_messages - ids already handled, so duplicates arriving by other paths are dropped
 * relay_history - which phone each packet was handed to (avoids re-sending, counts copies)
 * kv            - small counters and settings
 */

import * as SQLite from 'expo-sqlite/next';
import {
  ChatMessage,
  Contact,
  MessageStatus,
  QueueItem,
  QueueKind,
  RouteHop,
  SendMode,
  Transport,
  Priority,
} from '../types';

let db: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  peer_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL,
  transport TEXT NOT NULL,
  hop_count INTEGER NOT NULL DEFAULT 0,
  route_json TEXT NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL DEFAULT 'normal',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_peer ON messages (peer_id, created_at);
CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT PRIMARY KEY NOT NULL,
  bs_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT,
  public_key TEXT,
  last_seen_nearby INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS relay_queue (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  packet_json TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_own INTEGER NOT NULL DEFAULT 0,
  send_mode TEXT NOT NULL DEFAULT 'auto',
  source_node TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seen_messages (
  id TEXT PRIMARY KEY NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS relay_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  to_node TEXT NOT NULL,
  to_internet INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_history_msg ON relay_history (message_id);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

function conn(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not open');
  return db;
}

interface MessageRow {
  id: string;
  peer_id: string;
  sender_id: string;
  recipient_id: string;
  direction: 'in' | 'out';
  body: string | null;
  status: MessageStatus;
  transport: Transport;
  hop_count: number;
  route_json: string;
  priority: Priority;
  created_at: number;
  updated_at: number;
}

interface ContactRow {
  user_id: string;
  bs_id: string;
  display_name: string;
  username: string | null;
  public_key: string | null;
  last_seen_nearby: number | null;
  updated_at: number;
}

interface QueueRow {
  id: string;
  kind: QueueKind;
  packet_json: string;
  priority: number;
  is_own: number;
  send_mode: SendMode;
  source_node: string | null;
  expires_at: number;
  created_at: number;
}

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  peerId: r.peer_id,
  senderId: r.sender_id,
  recipientId: r.recipient_id,
  direction: r.direction,
  body: r.body,
  status: r.status,
  transport: r.transport,
  hopCount: r.hop_count,
  route: safeParse<RouteHop[]>(r.route_json, []),
  priority: r.priority,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toContact = (r: ContactRow): Contact => ({
  userId: r.user_id,
  bsId: r.bs_id,
  displayName: r.display_name,
  username: r.username,
  publicKey: r.public_key,
  lastSeenNearby: r.last_seen_nearby,
  updatedAt: r.updated_at,
});

const toQueueItem = (r: QueueRow): QueueItem => ({
  id: r.id,
  kind: r.kind,
  packet: JSON.parse(r.packet_json),
  priority: r.priority,
  isOwn: r.is_own === 1,
  sendMode: r.send_mode,
  sourceNode: r.source_node,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Status order; a status update never moves a message backwards. */
export const STATUS_RANK: Record<MessageStatus, number> = {
  PENDING: 0,
  STORED: 1,
  RELAYING: 2,
  RELAYED: 3,
  GATEWAY_REACHED: 4,
  SERVER_RECEIVED: 5,
  DELIVERED: 6,
  READ: 7,
  FAILED: 8,
  EXPIRED: 8,
};

export const database = {
  async open(userId: string): Promise<void> {
    if (db) await this.close();
    const name = `bartasetu_${userId.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}.db`;
    db = await SQLite.openDatabaseAsync(name);
    await db.execAsync(SCHEMA);
  },

  async close(): Promise<void> {
    if (!db) return;
    const current = db;
    db = null;
    try {
      await current.closeAsync();
    } catch {
      // already closed
    }
  },

  isOpen(): boolean {
    return db !== null;
  },

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  async saveMessage(m: ChatMessage): Promise<void> {
    await conn().runAsync(
      `INSERT OR REPLACE INTO messages
        (id, peer_id, sender_id, recipient_id, direction, body, status, transport, hop_count, route_json, priority, is_read, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_read FROM messages WHERE id = ?), ?), ?, ?)`,
      m.id, m.peerId, m.senderId, m.recipientId, m.direction, m.body, m.status, m.transport,
      m.hopCount, JSON.stringify(m.route), m.priority, m.id, m.direction === 'out' ? 1 : 0, m.createdAt, m.updatedAt,
    );
  },

  async getMessage(id: string): Promise<ChatMessage | null> {
    const row = await conn().getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id = ?', id);
    return row ? toMessage(row) : null;
  },

  async getConversation(peerId: string, limit = 300): Promise<ChatMessage[]> {
    const rows = await conn().getAllAsync<MessageRow>(
      'SELECT * FROM (SELECT * FROM messages WHERE peer_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC',
      peerId, limit,
    );
    return rows.map(toMessage);
  },

  /** Raise a message's status (ignores downgrades). Returns the updated message, if changed. */
  async updateStatus(
    id: string,
    status: MessageStatus,
    extra: { transport?: Transport; hopCount?: number; route?: RouteHop[] } = {},
  ): Promise<ChatMessage | null> {
    const current = await this.getMessage(id);
    if (!current) return null;
    const terminal = current.status === 'FAILED' || current.status === 'EXPIRED';
    if (!terminal && STATUS_RANK[status] < STATUS_RANK[current.status]) return null;
    if (terminal && STATUS_RANK[status] < STATUS_RANK.DELIVERED) return null;
    const updated: ChatMessage = {
      ...current,
      status,
      transport: extra.transport ?? current.transport,
      hopCount: extra.hopCount ?? current.hopCount,
      route: extra.route ?? current.route,
      updatedAt: Date.now(),
    };
    await this.saveMessage(updated);
    return updated;
  },

  async markConversationRead(peerId: string): Promise<void> {
    await conn().runAsync('UPDATE messages SET is_read = 1 WHERE peer_id = ? AND is_read = 0', peerId);
  },

  /** Own messages whose final status we have not learned yet. */
  async getUnconfirmedOutgoing(): Promise<ChatMessage[]> {
    const rows = await conn().getAllAsync<MessageRow>(
      `SELECT * FROM messages WHERE direction = 'out' AND status NOT IN ('DELIVERED','READ','FAILED','EXPIRED')
       ORDER BY created_at DESC LIMIT 200`,
    );
    return rows.map(toMessage);
  },

  async getConversationSummaries(): Promise<Array<{ peerId: string; last: ChatMessage; unread: number }>> {
    const rows = await conn().getAllAsync<MessageRow & { unread: number }>(
      `SELECT m.*, (SELECT COUNT(*) FROM messages u WHERE u.peer_id = m.peer_id AND u.is_read = 0) AS unread
       FROM messages m
       WHERE m.created_at = (SELECT MAX(created_at) FROM messages x WHERE x.peer_id = m.peer_id)
       GROUP BY m.peer_id
       ORDER BY m.created_at DESC`,
    );
    return rows.map((r) => ({ peerId: r.peer_id, last: toMessage(r), unread: r.unread }));
  },

  async countMessages(direction?: 'in' | 'out'): Promise<number> {
    const row = direction
      ? await conn().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE direction = ?', direction)
      : await conn().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages');
    return row?.n ?? 0;
  },

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------

  async upsertContact(c: Partial<Contact> & { userId: string; bsId: string; displayName: string }): Promise<Contact> {
    const existing = await this.getContact(c.userId);
    const merged: Contact = {
      userId: c.userId,
      bsId: c.bsId || existing?.bsId || '',
      displayName: c.displayName || existing?.displayName || c.bsId,
      username: c.username ?? existing?.username ?? null,
      publicKey: c.publicKey ?? existing?.publicKey ?? null,
      lastSeenNearby: c.lastSeenNearby ?? existing?.lastSeenNearby ?? null,
      updatedAt: Date.now(),
    };
    await conn().runAsync(
      `INSERT OR REPLACE INTO contacts (user_id, bs_id, display_name, username, public_key, last_seen_nearby, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      merged.userId, merged.bsId, merged.displayName, merged.username ?? null, merged.publicKey ?? null,
      merged.lastSeenNearby ?? null, merged.updatedAt,
    );
    return merged;
  },

  async getContact(userId: string): Promise<Contact | null> {
    const row = await conn().getFirstAsync<ContactRow>('SELECT * FROM contacts WHERE user_id = ?', userId);
    return row ? toContact(row) : null;
  },

  async getContactByBsId(bsId: string): Promise<Contact | null> {
    const row = await conn().getFirstAsync<ContactRow>('SELECT * FROM contacts WHERE bs_id = ?', bsId);
    return row ? toContact(row) : null;
  },

  async getContacts(): Promise<Contact[]> {
    const rows = await conn().getAllAsync<ContactRow>('SELECT * FROM contacts ORDER BY display_name COLLATE NOCASE');
    return rows.map(toContact);
  },

  // -------------------------------------------------------------------------
  // Relay queue (store-and-forward)
  // -------------------------------------------------------------------------

  async enqueue(item: QueueItem): Promise<void> {
    await conn().runAsync(
      `INSERT OR REPLACE INTO relay_queue (id, kind, packet_json, priority, is_own, send_mode, source_node, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id, item.kind, JSON.stringify(item.packet), item.priority, item.isOwn ? 1 : 0, item.sendMode,
      item.sourceNode, item.expiresAt, item.createdAt,
    );
  },

  async getQueue(): Promise<QueueItem[]> {
    const rows = await conn().getAllAsync<QueueRow>('SELECT * FROM relay_queue ORDER BY priority DESC, created_at ASC');
    return rows.map(toQueueItem);
  },

  async getQueueItem(id: string): Promise<QueueItem | null> {
    const row = await conn().getFirstAsync<QueueRow>('SELECT * FROM relay_queue WHERE id = ?', id);
    return row ? toQueueItem(row) : null;
  },

  async isQueued(id: string): Promise<boolean> {
    const row = await conn().getFirstAsync<{ id: string }>('SELECT id FROM relay_queue WHERE id = ?', id);
    return row != null;
  },

  async dequeue(id: string): Promise<void> {
    await conn().runAsync('DELETE FROM relay_queue WHERE id = ?', id);
  },

  /** Remove expired packets; returns the own-message ids that expired. */
  async purgeExpired(now = Date.now()): Promise<string[]> {
    const rows = await conn().getAllAsync<QueueRow>('SELECT * FROM relay_queue WHERE expires_at < ?', now);
    await conn().runAsync('DELETE FROM relay_queue WHERE expires_at < ?', now);
    return rows.filter((r) => r.is_own === 1 && r.kind === 'msg').map((r) => r.id);
  },

  /** 'own-messages': our chat messages waiting for a route; 'carried': packets held for other people. */
  async queueSize(which: 'own-messages' | 'carried'): Promise<number> {
    const row = await conn().getFirstAsync<{ n: number }>(
      which === 'own-messages'
        ? "SELECT COUNT(*) AS n FROM relay_queue WHERE is_own = 1 AND kind = 'msg'"
        : 'SELECT COUNT(*) AS n FROM relay_queue WHERE is_own = 0',
    );
    return row?.n ?? 0;
  },

  // -------------------------------------------------------------------------
  // Dedup + relay history
  // -------------------------------------------------------------------------

  async isSeen(id: string): Promise<boolean> {
    const row = await conn().getFirstAsync<{ id: string }>('SELECT id FROM seen_messages WHERE id = ?', id);
    return row != null;
  },

  async markSeen(id: string): Promise<void> {
    await conn().runAsync('INSERT OR IGNORE INTO seen_messages (id, seen_at) VALUES (?, ?)', id, Date.now());
  },

  async filterUnseen(ids: string[]): Promise<string[]> {
    const unseen: string[] = [];
    for (const id of ids) {
      if (!(await this.isSeen(id)) && !(await this.isQueued(id))) unseen.push(id);
    }
    return unseen;
  },

  async recordRelay(messageId: string, toNode: string, toInternet: boolean): Promise<void> {
    await conn().runAsync(
      'INSERT INTO relay_history (message_id, to_node, to_internet, at) VALUES (?, ?, ?, ?)',
      messageId, toNode, toInternet ? 1 : 0, Date.now(),
    );
  },

  async relayedTo(messageId: string): Promise<string[]> {
    const rows = await conn().getAllAsync<{ to_node: string }>(
      'SELECT to_node FROM relay_history WHERE message_id = ?', messageId,
    );
    return rows.map((r) => r.to_node);
  },

  // -------------------------------------------------------------------------
  // Counters
  // -------------------------------------------------------------------------

  async getCounter(key: string): Promise<number> {
    const row = await conn().getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? Number(row.value) || 0 : 0;
  },

  async incrementCounter(key: string, by = 1): Promise<number> {
    const next = (await this.getCounter(key)) + by;
    await conn().runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, String(next));
    return next;
  },
};
