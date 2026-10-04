/**
 * BartaSetu Mobile Application - Type Definitions
 * Complete TypeScript interfaces and models for authentication,
 * mesh networking, store-and-forward messaging, SOS alerts, and SQLite integration.
 */

// ============================================================================
// Authentication & User Types
// ============================================================================

export interface User {
  id: string;
  username: string;
  email: string;
  display_name?: string | null;
  is_active: boolean;
  created_at?: string | null;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  display_name?: string | null;
  token?: string;
  refresh_token?: string;
  is_active?: boolean;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

export interface UserLogin {
  username: string;
  password: string;
}

export interface UserResponse extends User {}

export interface UserListResponse {
  users: UserResponse[];
  total: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}

export interface PublicKeyInfo {
  user_id: string;
  public_key: string;
  key_type: string;
}

// ============================================================================
// Device & Mesh Networking Types
// ============================================================================

export interface DeviceRegister {
  device_name: string;
  fcm_token?: string | null;
  platform?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DeviceResponse {
  id: string;
  user_id: string;
  device_name: string | null;
  platform: string;
  is_online: boolean;
  last_seen: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
}

export interface KnownDevice {
  device_id: string;
  user_id?: string;
  display_name: string;
  last_seen: string;
  rssi: number;
  has_internet: boolean;
  latitude?: number;
  longitude?: number;
  battery_level?: number;
  relay_score: number;

  // Compatibility aliases
  id?: string;
  name?: string;
  distanceMeters?: number;
  distanceLabel?: string;
  hasInternet?: boolean;
  relayScore?: number;
  batteryLevel?: number;
  lastSeen?: number;
}

export interface MeshDevice {
  id: string;
  name: string;
  rssi: number; // dBm (-100 to -30)
  distanceMeters?: number;
  distanceLabel?: string;
  hasInternet: boolean;
  relayScore: number; // 0 to 100
  batteryLevel: number; // 0 to 100
  lastSeen: number; // timestamp ms
  publicKey?: string;
  deviceType?: 'android' | 'ios' | 'gateway' | 'relay';

  // Compatibility aliases with KnownDevice
  device_id?: string;
  display_name?: string;
  last_seen?: string;
  has_internet?: boolean;
  relay_score?: number;
  battery_level?: number;
  user_id?: string;
  latitude?: number;
  longitude?: number;
}

export interface MeshStats {
  messagesRelayed: number;
  hopsSaved: number;
  activePeersCount: number;
  lastRelayTimestamp: number | null;
}

export interface RelayCandidate {
  deviceId: string;
  hasInternet: boolean;
  rssi: number;
  distanceMeters: number;
  batteryLevel: number;
  previousSuccessRate: number;
  destinationProximityMeters?: number;
}

// ============================================================================
// Message & Store-and-Forward Types
// ============================================================================

export type MessagePriority = 'low' | 'normal' | 'high' | 'critical' | 'NORMAL' | 'CRITICAL';

export type MessageStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RELAYING'
  | 'RELAYED'
  | 'GATEWAY_REACHED'
  | 'SENT'
  | 'SERVER_RECEIVED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'EXPIRED';

export type MessageContentType = 'text' | 'image' | 'location' | 'sos' | 'ack' | string;

export interface MessageRouteHop {
  device_id: string;
  hop_number: number;
  action: 'ORIGIN' | 'RELAY' | 'GATEWAY' | 'DELIVERY';
  timestamp?: number;
}

export interface MessageCreate {
  id: string;
  recipient_id: string;
  encrypted_content: string;
  encrypted_key?: string | null;
  iv?: string | null;
  content_type?: MessageContentType;
  priority?: MessagePriority;
  hop_count?: number;
  max_hops?: number;
  ttl?: number;
  expires_at: string;
  created_at: string;
  gateway_device_id?: string | null;
  route?: MessageRouteHop[] | null;
}

export interface MessageResponse {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_content: string;
  encrypted_key?: string | null;
  iv?: string | null;
  content_type: string;
  priority: MessagePriority;
  status: MessageStatus;
  hop_count: number;
  created_at: string | null;
  received_at?: string | null;
}

export interface MessageSyncRequest {
  messages: MessageCreate[];
}

export interface MessageAck {
  message_id: string;
  status: 'DELIVERED' | 'READ' | 'FAILED' | string;
}

export interface MessageAckResponse {
  message: string;
  status: string;
}

/**
 * Local SQLite representation of a message
 */
export interface LocalMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_content: string;
  encrypted_key?: string | null;
  iv?: string | null;
  content_type: MessageContentType;
  priority: MessagePriority;
  status: MessageStatus;
  hop_count: number;
  max_hops: number;
  ttl: number;
  expires_at: string;
  created_at: string;
  updated_at?: string;
  received_at?: string | null;
  gateway_device_id?: string | null;
  route_json?: string | null;
  is_synced?: number; // 0 = false, 1 = true
  plaintext?: string; // Optional decrypted content for UI display
}

// Database helper entities
export interface RelayHistoryEntry {
  id?: number;
  message_id: string;
  from_device: string;
  to_device: string;
  relayed_at: string;
  success: boolean;
  relayed_by_device?: string;
  relayed_to_device?: string;
  timestamp?: string;
  hop_number?: number;
  status?: string;
}

export interface DeliveryStatusEntry {
  id?: number;
  message_id: string;
  recipient_id: string;
  status: MessageStatus;
  updated_at: string;
}

export interface SeenMessageEntry {
  message_id: string;
  first_seen_at?: string;
  seen_at?: string;
}

export interface QueryResult {
  insertId?: number;
  rowsAffected: number;
  rows: any[];
}

// ============================================================================
// SOS & Emergency Types
// ============================================================================

export type EmergencyType =
  | 'Trapped'
  | 'Medical'
  | 'Flood'
  | 'Cyclone'
  | 'Fire'
  | 'Earthquake'
  | 'General Emergency';

export interface SOSCreate {
  device_id: string;
  message?: string;
  latitude: number;
  longitude: number;
  battery_level?: number | null;
  emergency_type?: EmergencyType | string;
}

export interface SOSResponse {
  id: string;
  user_id: string;
  device_id: string;
  message: string | null;
  latitude: number;
  longitude: number;
  battery_level: number | null;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | string;
  created_at: string | null;
  resolved_at?: string | null;
}

export interface SOSPayload {
  id: string;
  timestamp: number;
  message: string;
  location: LocationCoordinates | null;
  batteryLevel: number;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
}

export interface LocalSOSAlert extends SOSResponse {
  is_synced: number;
}

// ============================================================================
// Location Types
// ============================================================================

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
}

// ============================================================================
// WebSocket Protocol Types
// ============================================================================

export type WebSocketEventType =
  | 'new_message'
  | 'delivery_ack'
  | 'sos_alert'
  | 'pong'
  | 'status'
  | 'error';

export interface BaseWebSocketMessage {
  type: WebSocketEventType;
}

export interface NewMessageWsEvent extends BaseWebSocketMessage {
  type: 'new_message';
  message: MessageResponse;
}

export interface DeliveryAckWsEvent extends BaseWebSocketMessage {
  type: 'delivery_ack';
  message_id: string;
  status: string;
}

export interface SOSAlertWsEvent extends BaseWebSocketMessage {
  type: 'sos_alert';
  alert: SOSResponse;
}

export interface PongWsEvent extends BaseWebSocketMessage {
  type: 'pong';
}

export interface StatusWsEvent extends BaseWebSocketMessage {
  type: 'status';
  online_users: number;
}

export interface ErrorWsEvent extends BaseWebSocketMessage {
  type: 'error';
  message: string;
}

export type WebSocketMessage =
  | NewMessageWsEvent
  | DeliveryAckWsEvent
  | SOSAlertWsEvent
  | PongWsEvent
  | StatusWsEvent
  | ErrorWsEvent;

export type WebSocketListener<T = any> = (data: T) => void;
