/**
 * BartaSetu Mobile Application - SQLite Local Database
 * 
 * Production-ready SQLite database layer supporting:
 * - react-native-quick-sqlite / quick-sqlite
 * - react-native-sqlite-storage
 * - expo-sqlite
 * - In-memory / mock storage engine fallback for tests and development environments.
 * 
 * Provides thread-safe asynchronous CRUD operations for local messages, known peer devices,
 * deduplication (seen messages), relay audit history, delivery receipts, and user profiles.
 */

import type {
  LocalMessage,
  KnownDevice,
  RelayHistoryEntry,
  UserProfile,
  MessageStatus,
  MessageContentType,
  MessagePriority,
  DeliveryStatusEntry,
  SeenMessageEntry,
  QueryResult,
} from '../types';

// ============================================================================
// Driver Abstraction & Interfaces
// ============================================================================

export type DriverType = 'quick-sqlite' | 'react-native-sqlite-storage' | 'expo-sqlite' | 'in-memory';

export interface ISqliteDriver {
  readonly type: DriverType;
  open(): Promise<void>;
  close(): Promise<void>;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  transaction<T>(action: (driver: ISqliteDriver) => Promise<T>): Promise<T>;
}

// ============================================================================
// Async Mutex for Thread Safety
// ============================================================================

class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  public async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

// ============================================================================
// In-Memory SQLite Fallback Engine
// ============================================================================

/**
 * High-fidelity in-memory SQLite emulation engine for Jest, Node.js, and CI environments
 * where native mobile binary bindings are unavailable.
 */
export class InMemoryDriver implements ISqliteDriver {
  public readonly type: DriverType = 'in-memory';
  private tables: Map<string, any[]> = new Map();
  private autoIncrements: Map<string, number> = new Map();
  private isOpen: boolean = false;

  public async open(): Promise<void> {
    this.isOpen = true;
  }

  public async close(): Promise<void> {
    this.isOpen = false;
  }

  public async clearAll(): Promise<void> {
    this.tables.clear();
    this.autoIncrements.clear();
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    const trimmed = sql.trim().replace(/;+$/, '');

    // 1. CREATE TABLE
    const createTableMatch = trimmed.match(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)/i);
    if (createTableMatch) {
      const tableName = createTableMatch[1];
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
        this.autoIncrements.set(tableName, 0);
      }
      return { rows: [], rowsAffected: 0 };
    }

    // 2. CREATE INDEX
    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(trimmed)) {
      return { rows: [], rowsAffected: 0 };
    }

    // 3. INSERT / INSERT OR REPLACE
    const insertMatch = trimmed.match(/^INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const columns = insertMatch[2].split(',').map((c) => c.trim());
      const isReplace = /^INSERT\s+OR\s+REPLACE/i.test(trimmed);

      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
        this.autoIncrements.set(tableName, 0);
      }

      const tableRows = this.tables.get(tableName)!;
      const row: Record<string, any> = {};

      columns.forEach((col, idx) => {
        row[col] = params[idx] !== undefined ? params[idx] : null;
      });

      // Handle autoincrement for tables with integer id
      if ((tableName === 'relay_history' || tableName === 'delivery_status') && (row.id === null || row.id === undefined)) {
        const nextId = (this.autoIncrements.get(tableName) || 0) + 1;
        this.autoIncrements.set(tableName, nextId);
        row.id = nextId;
      }

      // Determine Primary Key column
      let pkCol: string | null = null;
      if (tableName === 'local_messages') pkCol = 'id';
      else if (tableName === 'known_devices') pkCol = 'device_id';
      else if (tableName === 'seen_messages') pkCol = 'message_id';
      else if (tableName === 'local_users') pkCol = 'id';
      else if (tableName === 'relay_history') pkCol = 'id';
      else if (tableName === 'delivery_status') pkCol = 'id';

      if (isReplace && pkCol && row[pkCol] !== undefined) {
        const existingIdx = tableRows.findIndex((r) => r[pkCol!] === row[pkCol!]);
        if (existingIdx >= 0) {
          tableRows[existingIdx] = { ...tableRows[existingIdx], ...row };
          return { rows: [], rowsAffected: 1, insertId: row.id };
        }
      }

      tableRows.push(row);
      return { rows: [], rowsAffected: 1, insertId: row.id };
    }

    // 4. UPDATE
    const updateMatch = trimmed.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];

      const tableRows = this.tables.get(tableName) || [];
      const setAssignments = setClause.split(',').map((s) => s.trim());

      let paramIdx = 0;
      const updates: { col: string; val: any }[] = [];
      for (const assignment of setAssignments) {
        const col = assignment.split('=')[0].trim();
        updates.push({ col, val: params[paramIdx++] });
      }

      // Extract WHERE condition
      const whereCondition = whereClause.split('AND').map((w) => w.trim());
      const whereFilters: { col: string; val: any }[] = [];
      for (const condition of whereCondition) {
        const col = condition.split('=')[0].trim();
        whereFilters.push({ col, val: params[paramIdx++] });
      }

      let rowsAffected = 0;
      for (const row of tableRows) {
        const match = whereFilters.every((f) => row[f.col] === f.val);
        if (match) {
          updates.forEach((u) => {
            row[u.col] = u.val;
          });
          rowsAffected++;
        }
      }

      return { rows: [], rowsAffected };
    }

    // 5. SELECT
    const selectMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+|\?))?$/i);
    if (selectMatch) {
      const selectFields = selectMatch[1].trim();
      const tableName = selectMatch[2].trim();
      const whereClause = selectMatch[3]?.trim();
      const orderByClause = selectMatch[4]?.trim();
      const limitClause = selectMatch[5]?.trim();

      const tableRows = this.tables.get(tableName) || [];
      let result = [...tableRows];

      // Filter by WHERE
      if (whereClause) {
        let paramIdx = 0;
        const whereConditions = whereClause.split('AND').map((w) => w.trim());
        for (const condition of whereConditions) {
          const col = condition.split('=')[0].trim();
          const targetVal = params[paramIdx++];
          result = result.filter((row) => row[col] === targetVal);
        }
      }

      // Sort by ORDER BY
      if (orderByClause) {
        const parts = orderByClause.split(',').map((p) => p.trim());
        for (const part of parts) {
          const [orderCol, direction] = part.split(/\s+/);
          const isDesc = direction ? direction.toUpperCase() === 'DESC' : false;
          result.sort((a, b) => {
            const valA = a[orderCol];
            const valB = b[orderCol];
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return isDesc ? 1 : -1;
            if (valB === null || valB === undefined) return isDesc ? -1 : 1;
            if (valA < valB) return isDesc ? 1 : -1;
            return isDesc ? -1 : 1;
          });
        }
      }

      // Apply LIMIT
      if (limitClause) {
        let limitVal = parseInt(limitClause, 10);
        if (isNaN(limitVal)) {
          // It's a parameter '?'
          limitVal = params[params.length - 1];
        }
        if (typeof limitVal === 'number') {
          result = result.slice(0, limitVal);
        }
      }

      // Format rows
      const formattedRows = result.map((r) => ({ ...r }));
      return { rows: formattedRows, rowsAffected: 0 };
    }

    // 6. DELETE
    const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      const whereClause = deleteMatch[2]?.trim();
      const tableRows = this.tables.get(tableName) || [];

      if (!whereClause) {
        const count = tableRows.length;
        this.tables.set(tableName, []);
        return { rows: [], rowsAffected: count };
      }

      let paramIdx = 0;
      const whereConditions = whereClause.split('AND').map((w) => w.trim());
      const remaining: any[] = [];
      let deleted = 0;

      for (const row of tableRows) {
        let matches = true;
        let pIndex = paramIdx;
        for (const condition of whereConditions) {
          const col = condition.split('=')[0].trim();
          const targetVal = params[pIndex++];
          if (row[col] !== targetVal) {
            matches = false;
            break;
          }
        }
        if (matches) {
          deleted++;
        } else {
          remaining.push(row);
        }
      }

      this.tables.set(tableName, remaining);
      return { rows: [], rowsAffected: deleted };
    }

    // Default catch-all
    return { rows: [], rowsAffected: 0 };
  }

  public async transaction<T>(action: (driver: ISqliteDriver) => Promise<T>): Promise<T> {
    return action(this);
  }
}

// ============================================================================
// Native SQLite Drivers
// ============================================================================

/**
 * Driver adapter for quick-sqlite / react-native-quick-sqlite.
 */
class QuickSqliteDriver implements ISqliteDriver {
  public readonly type: DriverType = 'quick-sqlite';
  private db: any = null;
  private quickSqliteModule: any;

  constructor(quickSqliteModule: any) {
    this.quickSqliteModule = quickSqliteModule;
  }

  public async open(): Promise<void> {
    if (!this.db) {
      this.db = this.quickSqliteModule.open({ name: 'bartasetu.db' });
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      if (typeof this.db.close === 'function') {
        this.db.close();
      }
      this.db = null;
    }
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    if (!this.db) await this.open();
    const res = this.db.execute(sql, params);
    const rows = res?.rows?._array || res?.rows || [];
    return {
      rows: Array.isArray(rows) ? rows : (rows ? Array.from(rows) : []),
      rowsAffected: res?.rowsAffected ?? 0,
      insertId: res?.insertId,
    };
  }

  public async transaction<T>(action: (driver: ISqliteDriver) => Promise<T>): Promise<T> {
    return action(this);
  }
}

/**
 * Driver adapter for react-native-sqlite-storage.
 */
class RNSqliteStorageDriver implements ISqliteDriver {
  public readonly type: DriverType = 'react-native-sqlite-storage';
  private db: any = null;
  private sqliteModule: any;

  constructor(sqliteModule: any) {
    this.sqliteModule = sqliteModule;
  }

  public async open(): Promise<void> {
    if (!this.db) {
      if (typeof this.sqliteModule.enablePromise === 'function') {
        this.sqliteModule.enablePromise(true);
      }
      this.db = await this.sqliteModule.openDatabase({ name: 'bartasetu.db', location: 'default' });
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      if (typeof this.db.close === 'function') {
        await this.db.close();
      }
      this.db = null;
    }
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    if (!this.db) await this.open();
    const [res] = await this.db.executeSql(sql, params);
    const rows: any[] = [];
    if (res && res.rows) {
      if (typeof res.rows.raw === 'function') {
        rows.push(...res.rows.raw());
      } else {
        for (let i = 0; i < res.rows.length; i++) {
          rows.push(res.rows.item(i));
        }
      }
    }
    return {
      rows,
      rowsAffected: res?.rowsAffected ?? 0,
      insertId: res?.insertId,
    };
  }

  public async transaction<T>(action: (driver: ISqliteDriver) => Promise<T>): Promise<T> {
    return action(this);
  }
}

/**
 * Driver adapter for expo-sqlite.
 */
class ExpoSqliteDriver implements ISqliteDriver {
  public readonly type: DriverType = 'expo-sqlite';
  private db: any = null;
  private expoSqliteModule: any;

  constructor(expoSqliteModule: any) {
    this.expoSqliteModule = expoSqliteModule;
  }

  public async open(): Promise<void> {
    if (!this.db) {
      if (typeof this.expoSqliteModule.openDatabaseSync === 'function') {
        this.db = this.expoSqliteModule.openDatabaseSync('bartasetu.db');
      } else if (typeof this.expoSqliteModule.openDatabase === 'function') {
        this.db = this.expoSqliteModule.openDatabase('bartasetu.db');
      }
    }
  }

  public async close(): Promise<void> {
    if (this.db && typeof this.db.closeAsync === 'function') {
      await this.db.closeAsync();
    }
    this.db = null;
  }

  public async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    if (!this.db) await this.open();

    const isSelect = /^\s*SELECT/i.test(sql);

    // Modern Expo SQLite API (v14+)
    if (this.db.getAllAsync && this.db.runAsync) {
      if (isSelect) {
        const rows = await this.db.getAllAsync(sql, params);
        return { rows: rows || [], rowsAffected: 0 };
      } else {
        const res = await this.db.runAsync(sql, params);
        return {
          rows: [],
          rowsAffected: res.changes ?? 0,
          insertId: res.lastInsertRowId,
        };
      }
    }

    // Synchronous Expo SQLite API
    if (this.db.getAllSync && this.db.runSync) {
      if (isSelect) {
        const rows = this.db.getAllSync(sql, params);
        return { rows: rows || [], rowsAffected: 0 };
      } else {
        const res = this.db.runSync(sql, params);
        return {
          rows: [],
          rowsAffected: res.changes ?? 0,
          insertId: res.lastInsertRowId,
        };
      }
    }

    // Legacy Expo SQLite Transaction API
    return new Promise((resolve, reject) => {
      this.db.transaction(
        (tx: any) => {
          tx.executeSql(
            sql,
            params,
            (_: any, result: any) => {
              const rows: any[] = [];
              if (result && result.rows) {
                for (let i = 0; i < result.rows.length; i++) {
                  rows.push(result.rows.item(i));
                }
              }
              resolve({
                rows,
                rowsAffected: result.rowsAffected ?? 0,
                insertId: result.insertId,
              });
            },
            (_: any, error: any) => {
              reject(error);
              return false;
            }
          );
        },
        (error: any) => reject(error)
      );
    });
  }

  public async transaction<T>(action: (driver: ISqliteDriver) => Promise<T>): Promise<T> {
    return action(this);
  }
}

// ============================================================================
// Driver Auto-Detection & Loader
// ============================================================================

function tryDynamicRequire(moduleName: string): any {
  try {
    const dynamicRequire = new Function('name', 'try { return require(name); } catch(e) { return null; }');
    return dynamicRequire(moduleName);
  } catch {
    return null;
  }
}

function detectDriver(): ISqliteDriver {
  // 1. Try react-native-quick-sqlite or quick-sqlite
  const quickSqlite = tryDynamicRequire('react-native-quick-sqlite') || tryDynamicRequire('quick-sqlite');
  if (quickSqlite && typeof quickSqlite.open === 'function') {
    return new QuickSqliteDriver(quickSqlite);
  }

  // 2. Try react-native-sqlite-storage
  const rnSqlite = tryDynamicRequire('react-native-sqlite-storage');
  if (rnSqlite && (typeof rnSqlite.openDatabase === 'function' || typeof rnSqlite.open === 'function')) {
    return new RNSqliteStorageDriver(rnSqlite);
  }

  // 3. Try expo-sqlite
  const expoSqlite = tryDynamicRequire('expo-sqlite');
  if (expoSqlite && (typeof expoSqlite.openDatabaseSync === 'function' || typeof expoSqlite.openDatabase === 'function')) {
    return new ExpoSqliteDriver(expoSqlite);
  }

  // Fallback to in-memory driver
  return new InMemoryDriver();
}

// ============================================================================
// Row Mappers
// ============================================================================

function mapRowToMessage(row: any): LocalMessage {
  return {
    id: String(row.id),
    sender_id: String(row.sender_id),
    recipient_id: String(row.recipient_id),
    encrypted_content: String(row.encrypted_content),
    encrypted_key: row.encrypted_key != null ? String(row.encrypted_key) : null,
    iv: row.iv != null ? String(row.iv) : null,
    content_type: (row.content_type || 'text') as MessageContentType,
    priority: (row.priority || 'normal') as MessagePriority,
    status: (row.status || 'PENDING') as MessageStatus,
    hop_count: Number(row.hop_count ?? 0),
    max_hops: Number(row.max_hops ?? 10),
    ttl: Number(row.ttl ?? 86400),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

function mapRowToDevice(row: any): KnownDevice {
  const lastSeenMs = isNaN(Number(row.last_seen))
    ? new Date(row.last_seen).getTime()
    : Number(row.last_seen);
  return {
    id: String(row.device_id),
    device_id: String(row.device_id),
    name: String(row.display_name),
    display_name: String(row.display_name),
    user_id: row.user_id != null ? String(row.user_id) : undefined,
    lastSeen: lastSeenMs || Date.now(),
    last_seen: String(row.last_seen),
    rssi: Number(row.rssi ?? 0),
    hasInternet: Boolean(row.has_internet === 1 || row.has_internet === true || row.has_internet === '1'),
    has_internet: Boolean(row.has_internet === 1 || row.has_internet === true || row.has_internet === '1'),
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
    batteryLevel: row.battery_level != null ? Number(row.battery_level) * 100 : 80,
    battery_level: row.battery_level != null ? Number(row.battery_level) : undefined,
    relayScore: Number(row.relay_score ?? 0.0),
    relay_score: Number(row.relay_score ?? 0.0),
  };
}

function mapRowToUser(row: any): UserProfile {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    is_active: true,
    display_name: row.display_name != null ? String(row.display_name) : undefined,
    token: row.token != null ? String(row.token) : undefined,
    refresh_token: row.refresh_token != null ? String(row.refresh_token) : undefined,
  };
}

function mapRowToRelayHistory(row: any): RelayHistoryEntry {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    message_id: String(row.message_id),
    from_device: String(row.from_device),
    to_device: String(row.to_device),
    relayed_at: String(row.relayed_at),
    success: Boolean(row.success === 1 || row.success === true || row.success === '1'),
  };
}

function mapRowToDeliveryStatus(row: any): DeliveryStatusEntry {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    message_id: String(row.message_id),
    recipient_id: String(row.recipient_id),
    status: (row.status || 'DELIVERED') as MessageStatus,
    updated_at: String(row.updated_at),
  };
}

// ============================================================================
// Core Database Class
// ============================================================================

export class Database {
  private static instance: Database | null = null;
  private driver: ISqliteDriver;
  private mutex: AsyncMutex = new AsyncMutex();
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(driver?: ISqliteDriver) {
    this.driver = driver || detectDriver();
  }

  /**
   * Retrieves the singleton instance of the database.
   */
  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /**
   * Set custom driver (e.g. for testing or specialized environments).
   */
  public setDriver(driver: ISqliteDriver): void {
    this.driver = driver;
    this.isInitialized = false;
    this.initPromise = null;
  }

  /**
   * Returns the current active driver type.
   */
  public getDriverType(): DriverType {
    return this.driver.type;
  }

  /**
   * Forces the database to use the in-memory fallback mock storage.
   */
  public useMockStorage(): InMemoryDriver {
    const mock = new InMemoryDriver();
    this.setDriver(mock);
    return mock;
  }

  /**
   * Initializes SQLite tables, schemas, and performance indices.
   * Thread-safe and idempotent.
   */
  public async initDatabase(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.mutex.runExclusive(async () => {
      try {
        await this.driver.open();

        // 1. local_messages table
        await this.driver.execute(`
          CREATE TABLE IF NOT EXISTS local_messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            encrypted_content TEXT NOT NULL,
            encrypted_key TEXT,
            iv TEXT,
            content_type TEXT NOT NULL DEFAULT 'text',
            priority TEXT NOT NULL DEFAULT 'normal',
            status TEXT NOT NULL DEFAULT 'PENDING',
            hop_count INTEGER NOT NULL DEFAULT 0,
            max_hops INTEGER NOT NULL DEFAULT 10,
            ttl INTEGER NOT NULL DEFAULT 86400,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT
          );
        `);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_local_messages_status ON local_messages(status);`);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_local_messages_recipient ON local_messages(recipient_id);`);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_local_messages_created ON local_messages(created_at);`);

        // 2. known_devices table
        await this.driver.execute(`
          CREATE TABLE IF NOT EXISTS known_devices (
            device_id TEXT PRIMARY KEY,
            user_id TEXT,
            display_name TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            rssi INTEGER NOT NULL DEFAULT 0,
            has_internet INTEGER NOT NULL DEFAULT 0,
            latitude REAL,
            longitude REAL,
            battery_level REAL,
            relay_score REAL NOT NULL DEFAULT 0.0
          );
        `);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_known_devices_last_seen ON known_devices(last_seen);`);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_known_devices_relay_score ON known_devices(relay_score);`);

        // 3. seen_messages table
        await this.driver.execute(`
          CREATE TABLE IF NOT EXISTS seen_messages (
            message_id TEXT PRIMARY KEY,
            seen_at TEXT NOT NULL
          );
        `);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_seen_messages_seen_at ON seen_messages(seen_at);`);

        // 4. relay_history table
        await this.driver.execute(`
          CREATE TABLE IF NOT EXISTS relay_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            from_device TEXT NOT NULL,
            to_device TEXT NOT NULL,
            relayed_at TEXT NOT NULL,
            success INTEGER NOT NULL DEFAULT 1
          );
        `);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_relay_history_msg ON relay_history(message_id);`);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_relay_history_time ON relay_history(relayed_at);`);

        // 5. delivery_status table
        await this.driver.execute(`
          CREATE TABLE IF NOT EXISTS delivery_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);
        await this.driver.execute(`CREATE INDEX IF NOT EXISTS idx_delivery_status_msg ON delivery_status(message_id);`);

        // 6. local_users table
        await this.driver.execute(`
          CREATE TABLE IF NOT EXISTS local_users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT NOT NULL,
            display_name TEXT,
            token TEXT,
            refresh_token TEXT,
            updated_at TEXT NOT NULL
          );
        `);

        this.isInitialized = true;
      } catch (error) {
        console.error('[Database] Failed to initialize SQLite database:', error);
        throw error;
      } finally {
        this.initPromise = null;
      }
    });

    return this.initPromise;
  }

  /**
   * Helper to ensure database is initialized prior to CRUD queries.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initDatabase();
    }
  }

  // ==========================================================================
  // Message CRUD Operations
  // ==========================================================================

  /**
   * Saves or updates a message in the local SQLite store.
   */
  public async saveMessage(msg: LocalMessage): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `
          INSERT OR REPLACE INTO local_messages (
            id, sender_id, recipient_id, encrypted_content, encrypted_key, iv,
            content_type, priority, status, hop_count, max_hops, ttl,
            expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        const params = [
          msg.id,
          msg.sender_id,
          msg.recipient_id,
          msg.encrypted_content,
          msg.encrypted_key ?? null,
          msg.iv ?? null,
          msg.content_type || 'text',
          msg.priority || 'normal',
          msg.status || 'PENDING',
          msg.hop_count ?? 0,
          msg.max_hops ?? 10,
          msg.ttl ?? 86400,
          msg.expires_at,
          msg.created_at,
          msg.updated_at ?? new Date().toISOString(),
        ];
        await this.driver.execute(query, params);
      } catch (error) {
        console.error(`[Database] Failed to save message ${msg.id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Retrieves a message by its unique ID.
   */
  public async getMessage(id: string): Promise<LocalMessage | null> {
    await this.ensureInitialized();
    try {
      const query = `SELECT * FROM local_messages WHERE id = ? LIMIT 1;`;
      const result = await this.driver.execute(query, [id]);
      if (result.rows.length === 0) return null;
      return mapRowToMessage(result.rows[0]);
    } catch (error) {
      console.error(`[Database] Failed to get message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves messages, optionally filtered by status, ordered by created_at DESC.
   */
  public async getMessages(filterStatus?: MessageStatus): Promise<LocalMessage[]> {
    await this.ensureInitialized();
    try {
      let query: string;
      let params: any[] = [];
      if (filterStatus) {
        query = `SELECT * FROM local_messages WHERE status = ? ORDER BY created_at DESC;`;
        params = [filterStatus];
      } else {
        query = `SELECT * FROM local_messages ORDER BY created_at DESC;`;
      }
      const result = await this.driver.execute(query, params);
      return result.rows.map(mapRowToMessage);
    } catch (error) {
      console.error(`[Database] Failed to get messages with status ${filterStatus}:`, error);
      throw error;
    }
  }

  /**
   * Updates status and updated_at timestamp of a message.
   */
  public async updateMessageStatus(id: string, status: MessageStatus): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `UPDATE local_messages SET status = ?, updated_at = ? WHERE id = ?;`;
        const updatedAt = new Date().toISOString();
        await this.driver.execute(query, [status, updatedAt, id]);
      } catch (error) {
        console.error(`[Database] Failed to update status for message ${id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Deletes a local message by ID.
   */
  public async deleteMessage(id: string): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `DELETE FROM local_messages WHERE id = ?;`;
        await this.driver.execute(query, [id]);
      } catch (error) {
        console.error(`[Database] Failed to delete message ${id}:`, error);
        throw error;
      }
    });
  }

  // ==========================================================================
  // Deduplication & Seen Message Tracking
  // ==========================================================================

  /**
   * Checks whether a message has already been received or processed by this node.
   */
  public async isMessageSeen(messageId: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      const query = `SELECT 1 FROM seen_messages WHERE message_id = ? LIMIT 1;`;
      const result = await this.driver.execute(query, [messageId]);
      return result.rows.length > 0;
    } catch (error) {
      console.error(`[Database] Failed to check seen message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Marks a message as seen.
   * Returns true if newly marked, or false if it was already seen.
   */
  public async markMessageSeen(messageId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const alreadySeen = await this.isMessageSeen(messageId);
        if (alreadySeen) {
          return false;
        }

        const query = `INSERT OR REPLACE INTO seen_messages (message_id, seen_at) VALUES (?, ?);`;
        const seenAt = new Date().toISOString();
        await this.driver.execute(query, [messageId, seenAt]);
        return true;
      } catch (error) {
        console.error(`[Database] Failed to mark message seen ${messageId}:`, error);
        throw error;
      }
    });
  }

  // ==========================================================================
  // Known Device Operations
  // ==========================================================================

  /**
   * Saves or updates a discovered BLE / mesh peer device.
   */
  public async saveOrUpdateDevice(device: KnownDevice): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `
          INSERT OR REPLACE INTO known_devices (
            device_id, user_id, display_name, last_seen, rssi,
            has_internet, latitude, longitude, battery_level, relay_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        const devId = device.device_id || device.id;
        const dispName = device.display_name || device.name;
        const lastSeenStr = device.last_seen ? String(device.last_seen) : new Date(device.lastSeen || Date.now()).toISOString();
        const hasInternetNum = (device.has_internet ?? device.hasInternet) ? 1 : 0;
        const batt = device.battery_level !== undefined ? device.battery_level : (device.batteryLevel !== undefined ? device.batteryLevel / 100 : null);
        const rScore = device.relay_score !== undefined ? device.relay_score : (device.relayScore !== undefined ? device.relayScore / 100 : 0.0);

        const params = [
          devId,
          device.user_id ?? null,
          dispName,
          lastSeenStr,
          device.rssi ?? 0,
          hasInternetNum,
          device.latitude ?? null,
          device.longitude ?? null,
          batt,
          rScore,
        ];
        await this.driver.execute(query, params);
      } catch (error) {
        console.error(`[Database] Failed to save device ${device.device_id || device.id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Retrieves all discovered devices, ordered by last_seen DESC.
   */
  public async getKnownDevices(): Promise<KnownDevice[]> {
    await this.ensureInitialized();
    try {
      const query = `SELECT * FROM known_devices ORDER BY last_seen DESC;`;
      const result = await this.driver.execute(query, []);
      return result.rows.map(mapRowToDevice);
    } catch (error) {
      console.error('[Database] Failed to get known devices:', error);
      throw error;
    }
  }

  /**
   * Retrieves a specific device by its device_id.
   */
  public async getDevice(deviceId: string): Promise<KnownDevice | null> {
    await this.ensureInitialized();
    try {
      const query = `SELECT * FROM known_devices WHERE device_id = ? LIMIT 1;`;
      const result = await this.driver.execute(query, [deviceId]);
      if (result.rows.length === 0) return null;
      return mapRowToDevice(result.rows[0]);
    } catch (error) {
      console.error(`[Database] Failed to get device ${deviceId}:`, error);
      throw error;
    }
  }

  // ==========================================================================
  // Relay Audit History
  // ==========================================================================

  /**
   * Records a mesh relay attempt for tracking hop audits and peer reliability scoring.
   */
  public async recordRelay(
    messageId: string,
    fromDevice: string,
    toDevice: string,
    success: boolean
  ): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `
          INSERT INTO relay_history (
            message_id, from_device, to_device, relayed_at, success
          ) VALUES (?, ?, ?, ?, ?);
        `;
        const relayedAt = new Date().toISOString();
        const successVal = success ? 1 : 0;
        await this.driver.execute(query, [messageId, fromDevice, toDevice, relayedAt, successVal]);
      } catch (error) {
        console.error(`[Database] Failed to record relay for message ${messageId}:`, error);
        throw error;
      }
    });
  }

  /**
   * Retrieves relay history entries, optionally filtered by message ID.
   */
  public async getRelayHistory(messageId?: string): Promise<RelayHistoryEntry[]> {
    await this.ensureInitialized();
    try {
      let query: string;
      let params: any[] = [];
      if (messageId) {
        query = `SELECT * FROM relay_history WHERE message_id = ? ORDER BY relayed_at DESC;`;
        params = [messageId];
      } else {
        query = `SELECT * FROM relay_history ORDER BY relayed_at DESC;`;
      }
      const result = await this.driver.execute(query, params);
      return result.rows.map(mapRowToRelayHistory);
    } catch (error) {
      console.error('[Database] Failed to get relay history:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Delivery Status Tracking
  // ==========================================================================

  /**
   * Records or updates a message delivery receipt status.
   */
  public async recordDeliveryStatus(entry: DeliveryStatusEntry): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `
          INSERT INTO delivery_status (
            message_id, recipient_id, status, updated_at
          ) VALUES (?, ?, ?, ?);
        `;
        const updatedAt = entry.updated_at || new Date().toISOString();
        await this.driver.execute(query, [entry.message_id, entry.recipient_id, entry.status, updatedAt]);
      } catch (error) {
        console.error(`[Database] Failed to record delivery status for message ${entry.message_id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Retrieves the latest delivery status receipt for a given message.
   */
  public async getDeliveryStatus(messageId: string): Promise<DeliveryStatusEntry | null> {
    await this.ensureInitialized();
    try {
      const query = `SELECT * FROM delivery_status WHERE message_id = ? ORDER BY updated_at DESC LIMIT 1;`;
      const result = await this.driver.execute(query, [messageId]);
      if (result.rows.length === 0) return null;
      return mapRowToDeliveryStatus(result.rows[0]);
    } catch (error) {
      console.error(`[Database] Failed to get delivery status for ${messageId}:`, error);
      throw error;
    }
  }

  // ==========================================================================
  // Local User Operations
  // ==========================================================================

  /**
   * Saves or updates the authenticated local user profile.
   */
  public async saveLocalUser(user: UserProfile): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        const query = `
          INSERT OR REPLACE INTO local_users (
            id, username, email, display_name, token, refresh_token, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?);
        `;
        const updatedAt = new Date().toISOString();
        const params = [
          user.id,
          user.username,
          user.email,
          user.display_name ?? null,
          user.token ?? null,
          user.refresh_token ?? null,
          updatedAt,
        ];
        await this.driver.execute(query, params);
      } catch (error) {
        console.error(`[Database] Failed to save local user ${user.id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Retrieves the current local user profile, if one exists.
   */
  public async getLocalUser(): Promise<UserProfile | null> {
    await this.ensureInitialized();
    try {
      const query = `SELECT * FROM local_users ORDER BY updated_at DESC LIMIT 1;`;
      const result = await this.driver.execute(query, []);
      if (result.rows.length === 0) return null;
      return mapRowToUser(result.rows[0]);
    } catch (error) {
      console.error('[Database] Failed to get local user:', error);
      throw error;
    }
  }

  /**
   * Clears all local user records (e.g. upon user logout).
   */
  public async clearLocalUser(): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      try {
        await this.driver.execute(`DELETE FROM local_users;`, []);
      } catch (error) {
        console.error('[Database] Failed to clear local user:', error);
        throw error;
      }
    });
  }

  // ==========================================================================
  // Direct Query & Maintenance
  // ==========================================================================

  /**
   * Executes a direct SQL query against the active SQLite driver.
   */
  public async executeSql(sql: string, params: any[] = []): Promise<QueryResult> {
    await this.ensureInitialized();
    return this.driver.execute(sql, params);
  }

  /**
   * Clears all records from all tables (useful for unit tests and clean resets).
   */
  public async clearAll(): Promise<void> {
    await this.ensureInitialized();
    return this.mutex.runExclusive(async () => {
      await this.driver.execute(`DELETE FROM local_messages;`);
      await this.driver.execute(`DELETE FROM known_devices;`);
      await this.driver.execute(`DELETE FROM seen_messages;`);
      await this.driver.execute(`DELETE FROM relay_history;`);
      await this.driver.execute(`DELETE FROM delivery_status;`);
      await this.driver.execute(`DELETE FROM local_users;`);
    });
  }

  /**
   * Closes the active database connection.
   */
  public async close(): Promise<void> {
    await this.driver.close();
    this.isInitialized = false;
  }

  // ==========================================================================
  // Static Helper Delegates (Supports Database.method() syntax)
  // ==========================================================================

  public static async initDatabase(): Promise<void> {
    return Database.getInstance().initDatabase();
  }

  public static async saveMessage(msg: LocalMessage): Promise<void> {
    return Database.getInstance().saveMessage(msg);
  }

  public static async getMessage(id: string): Promise<LocalMessage | null> {
    return Database.getInstance().getMessage(id);
  }

  public static async getMessages(filterStatus?: MessageStatus): Promise<LocalMessage[]> {
    return Database.getInstance().getMessages(filterStatus);
  }

  public static async updateMessageStatus(id: string, status: MessageStatus): Promise<void> {
    return Database.getInstance().updateMessageStatus(id, status);
  }

  public static async markMessageSeen(messageId: string): Promise<boolean> {
    return Database.getInstance().markMessageSeen(messageId);
  }

  public static async isMessageSeen(messageId: string): Promise<boolean> {
    return Database.getInstance().isMessageSeen(messageId);
  }

  public static async saveOrUpdateDevice(device: KnownDevice): Promise<void> {
    return Database.getInstance().saveOrUpdateDevice(device);
  }

  public static async getKnownDevices(): Promise<KnownDevice[]> {
    return Database.getInstance().getKnownDevices();
  }

  public static async recordRelay(
    messageId: string,
    fromDevice: string,
    toDevice: string,
    success: boolean
  ): Promise<void> {
    return Database.getInstance().recordRelay(messageId, fromDevice, toDevice, success);
  }

  public static async saveLocalUser(user: UserProfile): Promise<void> {
    return Database.getInstance().saveLocalUser(user);
  }

  public static async getLocalUser(): Promise<UserProfile | null> {
    return Database.getInstance().getLocalUser();
  }

  public static async clearLocalUser(): Promise<void> {
    return Database.getInstance().clearLocalUser();
  }
}

// ============================================================================
// Singleton Instance Export
// ============================================================================

export const database = Database.getInstance();
export default database;
