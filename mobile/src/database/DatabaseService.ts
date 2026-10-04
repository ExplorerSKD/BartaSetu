/**
 * DatabaseService.ts
 * Robust SQLite storage layer for BartaSetu mobile application.
 * Manages local persistence for messages, SOS alerts, and discovered mesh devices.
 * Supports store-and-forward offline buffering with resilient execution.
 */

import { LocalMessage, LocalSOSAlert, MeshDevice, MessageStatus } from '../types';

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private db: any = null;
  private isInitialized = false;

  // In-memory fallback cache to guarantee fault tolerance in any runtime environment
  private memoryMessages: Map<string, LocalMessage> = new Map();
  private memorySOSAlerts: Map<string, LocalSOSAlert> = new Map();
  private memoryDevices: Map<string, MeshDevice> = new Map();

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize SQLite database and ensure all required schemas exist
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamic import of expo-sqlite to gracefully support Expo/RN environments
      const SQLite: any = await import('expo-sqlite');
      if (SQLite && typeof SQLite.openDatabaseSync === 'function') {
        this.db = SQLite.openDatabaseSync('bartasetu.db');
      } else if (SQLite && typeof SQLite.openDatabase === 'function') {
        this.db = SQLite.openDatabase('bartasetu.db');
      }
    } catch {
      // Running in environment without native SQLite linked or during mock tests
      this.db = null;
    }

    await this.createTables();
    this.isInitialized = true;
  }

  private async executeSql(sql: string, params: any[] = []): Promise<any> {
    if (!this.db) return null;

    try {
      if (this.db.execAsync) {
        return await this.db.execAsync(sql);
      } else if (this.db.runAsync) {
        return await this.db.runAsync(sql, params);
      } else if (this.db.transaction) {
        return new Promise((resolve, reject) => {
          this.db.transaction((tx: any) => {
            tx.executeSql(
              sql,
              params,
              (_: any, result: any) => resolve(result),
              (_: any, error: any) => {
                reject(error);
                return false;
              }
            );
          });
        });
      }
    } catch (e) {
      console.warn('Database executeSql error, using in-memory store:', e);
      return null;
    }
  }

  private async createTables(): Promise<void> {
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        encrypted_content TEXT NOT NULL,
        encrypted_key TEXT,
        iv TEXT,
        content_type TEXT DEFAULT 'text',
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'PENDING',
        hop_count INTEGER DEFAULT 0,
        max_hops INTEGER DEFAULT 10,
        ttl INTEGER DEFAULT 86400,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        received_at TEXT,
        gateway_device_id TEXT,
        route_json TEXT,
        is_synced INTEGER DEFAULT 0,
        plaintext TEXT
      );
    `;

    const createSOSTable = `
      CREATE TABLE IF NOT EXISTS sos_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        message TEXT,
        latitude REAL,
        longitude REAL,
        battery_level INTEGER,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        is_synced INTEGER DEFAULT 0
      );
    `;

    const createDevicesTable = `
      CREATE TABLE IF NOT EXISTS mesh_devices (
        id TEXT PRIMARY KEY,
        name TEXT,
        rssi INTEGER,
        distance_meters REAL,
        has_internet INTEGER DEFAULT 0,
        relay_score REAL DEFAULT 0,
        battery_level INTEGER DEFAULT 100,
        last_seen INTEGER NOT NULL
      );
    `;

    await this.executeSql(createMessagesTable);
    await this.executeSql(createSOSTable);
    await this.executeSql(createDevicesTable);
  }

  // ==========================================================================
  // Message Methods (Store-and-Forward)
  // ==========================================================================

  public async saveMessage(msg: LocalMessage): Promise<void> {
    await this.init();
    this.memoryMessages.set(msg.id, { ...msg });

    const sql = `
      INSERT OR REPLACE INTO messages (
        id, sender_id, recipient_id, encrypted_content, encrypted_key, iv,
        content_type, priority, status, hop_count, max_hops, ttl,
        expires_at, created_at, received_at, gateway_device_id, route_json, is_synced, plaintext
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      msg.id,
      msg.sender_id,
      msg.recipient_id,
      msg.encrypted_content,
      msg.encrypted_key || null,
      msg.iv || null,
      msg.content_type || 'text',
      msg.priority || 'normal',
      msg.status || 'PENDING',
      msg.hop_count || 0,
      msg.max_hops || 10,
      msg.ttl || 86400,
      msg.expires_at,
      msg.created_at,
      msg.received_at || null,
      msg.gateway_device_id || null,
      msg.route_json || null,
      msg.is_synced ? 1 : 0,
      msg.plaintext || null
    ];

    await this.executeSql(sql, params);
  }

  public async getMessage(id: string): Promise<LocalMessage | null> {
    await this.init();
    if (this.memoryMessages.has(id)) {
      return this.memoryMessages.get(id)!;
    }

    if (this.db?.getAllAsync) {
      const rows = await this.db.getAllAsync('SELECT * FROM messages WHERE id = ?', [id]);
      if (rows && rows.length > 0) return this.mapRowToMessage(rows[0]);
    }
    return null;
  }

  public async getAllMessages(): Promise<LocalMessage[]> {
    await this.init();
    if (this.db?.getAllAsync) {
      try {
        const rows = await this.db.getAllAsync('SELECT * FROM messages ORDER BY created_at ASC');
        if (rows && rows.length > 0) {
          const list = rows.map((r: any) => this.mapRowToMessage(r));
          list.forEach((m: LocalMessage) => this.memoryMessages.set(m.id, m));
          return list;
        }
      } catch (e) {
        console.warn('Failed getAllAsync messages:', e);
      }
    }
    return Array.from(this.memoryMessages.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  public async getConversationMessages(currentUserId: string, peerUserId: string): Promise<LocalMessage[]> {
    await this.init();
    const all = await this.getAllMessages();
    return all.filter(
      (m) =>
        (m.sender_id === currentUserId && m.recipient_id === peerUserId) ||
        (m.sender_id === peerUserId && m.recipient_id === currentUserId)
    );
  }

  public async getPendingMessages(): Promise<LocalMessage[]> {
    await this.init();
    const all = await this.getAllMessages();
    return all.filter((m) => m.status === 'PENDING' || m.is_synced === 0);
  }

  public async updateMessageStatus(id: string, status: MessageStatus, isSynced?: boolean): Promise<void> {
    await this.init();
    const msg = this.memoryMessages.get(id);
    if (msg) {
      msg.status = status;
      if (isSynced !== undefined) {
        msg.is_synced = isSynced ? 1 : 0;
      }
      this.memoryMessages.set(id, { ...msg });
    }

    const syncClause = isSynced !== undefined ? ', is_synced = ?' : '';
    const sql = `UPDATE messages SET status = ?${syncClause} WHERE id = ?;`;
    const params = isSynced !== undefined ? [status, isSynced ? 1 : 0, id] : [status, id];
    await this.executeSql(sql, params);
  }

  public async markMessageSynced(id: string, serverStatus: MessageStatus = 'SERVER_RECEIVED'): Promise<void> {
    await this.updateMessageStatus(id, serverStatus, true);
  }

  public async getPendingCount(): Promise<number> {
    const pending = await this.getPendingMessages();
    return pending.length;
  }

  // ==========================================================================
  // SOS Alert Methods
  // ==========================================================================

  public async saveSOSAlert(alert: LocalSOSAlert): Promise<void> {
    await this.init();
    this.memorySOSAlerts.set(alert.id, { ...alert });

    const sql = `
      INSERT OR REPLACE INTO sos_alerts (
        id, user_id, device_id, message, latitude, longitude,
        battery_level, status, created_at, resolved_at, is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      alert.id,
      alert.user_id,
      alert.device_id,
      alert.message,
      alert.latitude,
      alert.longitude,
      alert.battery_level || null,
      alert.status,
      alert.created_at,
      alert.resolved_at || null,
      alert.is_synced ? 1 : 0
    ];
    await this.executeSql(sql, params);
  }

  public async getAllSOSAlerts(): Promise<LocalSOSAlert[]> {
    await this.init();
    if (this.db?.getAllAsync) {
      try {
        const rows = await this.db.getAllAsync('SELECT * FROM sos_alerts ORDER BY created_at DESC');
        if (rows && rows.length > 0) {
          const list = rows.map((r: any) => this.mapRowToSOSAlert(r));
          list.forEach((a: LocalSOSAlert) => this.memorySOSAlerts.set(a.id, a));
          return list;
        }
      } catch (e) {
        console.warn('Failed getAllAsync SOS alerts:', e);
      }
    }
    return Array.from(this.memorySOSAlerts.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }

  public async updateSOSAlertStatus(id: string, status: string, isSynced: boolean = true): Promise<void> {
    await this.init();
    const alert = this.memorySOSAlerts.get(id);
    if (alert) {
      alert.status = status;
      alert.is_synced = isSynced ? 1 : 0;
      if (status === 'RESOLVED') {
        alert.resolved_at = new Date().toISOString();
      }
      this.memorySOSAlerts.set(id, { ...alert });
    }

    const sql = `UPDATE sos_alerts SET status = ?, is_synced = ?, resolved_at = ? WHERE id = ?;`;
    const resolvedAt = status === 'RESOLVED' ? new Date().toISOString() : null;
    await this.executeSql(sql, [status, isSynced ? 1 : 0, resolvedAt, id]);
  }

  // ==========================================================================
  // Mesh Devices Persistence
  // ==========================================================================

  public async saveMeshDevice(device: MeshDevice): Promise<void> {
    await this.init();
    this.memoryDevices.set(device.id, { ...device });

    const sql = `
      INSERT OR REPLACE INTO mesh_devices (
        id, name, rssi, distance_meters, has_internet, relay_score, battery_level, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      device.id,
      device.name,
      device.rssi,
      device.distanceMeters || null,
      device.hasInternet ? 1 : 0,
      device.relayScore,
      device.batteryLevel,
      device.lastSeen
    ];
    await this.executeSql(sql, params);
  }

  public async getMeshDevices(): Promise<MeshDevice[]> {
    await this.init();
    if (this.db?.getAllAsync) {
      try {
        const rows = await this.db.getAllAsync('SELECT * FROM mesh_devices ORDER BY last_seen DESC');
        if (rows && rows.length > 0) {
          const list = rows.map((r: any) => this.mapRowToMeshDevice(r));
          list.forEach((d: MeshDevice) => this.memoryDevices.set(d.id, d));
          return list;
        }
      } catch (e) {
        console.warn('Failed getAllAsync mesh devices:', e);
      }
    }
    return Array.from(this.memoryDevices.values()).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  // ==========================================================================
  // Helper Mappers
  // ==========================================================================

  private mapRowToMessage(row: any): LocalMessage {
    return {
      id: row.id,
      sender_id: row.sender_id,
      recipient_id: row.recipient_id,
      encrypted_content: row.encrypted_content,
      encrypted_key: row.encrypted_key,
      iv: row.iv,
      content_type: row.content_type,
      priority: row.priority,
      status: row.status,
      hop_count: Number(row.hop_count),
      max_hops: Number(row.max_hops),
      ttl: Number(row.ttl),
      expires_at: row.expires_at,
      created_at: row.created_at,
      received_at: row.received_at,
      gateway_device_id: row.gateway_device_id,
      route_json: row.route_json,
      is_synced: Number(row.is_synced),
      plaintext: row.plaintext || undefined
    };
  }

  private mapRowToSOSAlert(row: any): LocalSOSAlert {
    return {
      id: row.id,
      user_id: row.user_id,
      device_id: row.device_id,
      message: row.message,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      battery_level: row.battery_level !== null ? Number(row.battery_level) : null,
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      is_synced: Number(row.is_synced)
    };
  }

  private mapRowToMeshDevice(row: any): MeshDevice {
    return {
      id: row.id,
      name: row.name,
      rssi: Number(row.rssi),
      distanceMeters: row.distance_meters !== null ? Number(row.distance_meters) : undefined,
      hasInternet: Boolean(row.has_internet),
      relayScore: Number(row.relay_score),
      batteryLevel: Number(row.battery_level),
      lastSeen: Number(row.last_seen)
    };
  }
}

export const dbService = DatabaseService.getInstance();
