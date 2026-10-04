// ============================================================================
// Accounts
// ============================================================================

export interface User {
  id: string;
  bs_id: string;
  username: string;
  email: string;
  display_name?: string | null;
}

export interface PublicUser {
  id: string;
  bs_id: string | null;
  username: string;
  display_name?: string | null;
  public_key?: string | null;
  is_online?: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

/** Someone this phone can message: found by BartaSetu ID or met over the mesh. */
export interface Contact {
  userId: string;
  bsId: string;
  displayName: string;
  username?: string | null;
  publicKey?: string | null;
  lastSeenNearby?: number | null;
  updatedAt: number;
}

// ============================================================================
// Messages
// ============================================================================

export type MessageStatus =
  | 'PENDING'
  | 'STORED'
  | 'RELAYING'
  | 'RELAYED'
  | 'GATEWAY_REACHED'
  | 'SERVER_RECEIVED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'EXPIRED';

/** How a message travelled (or is travelling). */
export type Transport = 'internet' | 'direct' | 'mesh';

/** What the sender picked in the composer. */
export type SendMode = 'auto' | 'internet' | 'nearby';

export type Priority = 'normal' | 'critical';

export interface RouteHop {
  node: string; // user id of the phone
  bsId?: string;
  hop: number;
  action: 'ORIGIN' | 'RELAY' | 'GATEWAY' | 'RECIPIENT';
  at: number;
}

export interface ChatMessage {
  id: string;
  peerId: string; // the other person in the conversation
  senderId: string;
  recipientId: string;
  direction: 'in' | 'out';
  body: string | null; // null when it could not be decrypted
  status: MessageStatus;
  transport: Transport;
  hopCount: number;
  route: RouteHop[];
  priority: Priority;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  contact: Contact;
  lastMessage: ChatMessage | null;
  unread: number;
}

// ============================================================================
// Server payloads
// ============================================================================

export interface ServerMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_content: string;
  content_type: string;
  priority: string;
  status: string;
  hop_count: number;
  max_hops?: number | null;
  expires_at?: string | null;
  created_at?: string | null;
}

// ============================================================================
// Mesh wire format (JSON envelopes sent phone-to-phone)
// ============================================================================

/** An encrypted chat message travelling through the mesh. */
export interface MsgPacket {
  id: string;
  sender_id: string;
  sender_bs_id: string;
  sender_name: string;
  sender_pub: string;
  recipient_id: string;
  encrypted_content: string;
  priority: Priority;
  hop_count: number;
  max_hops: number;
  ttl: number;
  expires_at: string;
  created_at: string;
  route: RouteHop[];
}

/** A status update travelling back to the original sender. */
export interface AckPacket {
  id: string;
  message_id: string;
  status: MessageStatus;
  from: string; // recipient (for DELIVERED) or the gateway phone
  to: string; // original sender
  hop_count: number;
  max_hops: number;
  expires_at: string;
  created_at: string;
}

/** An emergency alert. Flooded to every nearby phone and uploaded by any gateway. */
export interface SosPacket {
  id: string;
  user_id: string;
  bs_id: string;
  name: string;
  message: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  battery: number | null;
  hop_count: number;
  max_hops: number;
  expires_at: string;
  created_at: string;
}

export interface HelloPayload {
  userId: string;
  bsId: string;
  displayName: string;
  publicKey: string;
  hasInternet: boolean;
  battery: number;
  lat?: number | null;
  lon?: number | null;
}

export type Envelope =
  | { v: 1; t: 'hello'; from: string; hello: HelloPayload; reply?: boolean }
  | { v: 1; t: 'summary'; from: string; ids: string[] }
  | { v: 1; t: 'want'; from: string; ids: string[]; offered?: string[] }
  | { v: 1; t: 'msg'; from: string; packet: MsgPacket }
  | { v: 1; t: 'ack'; from: string; packet: AckPacket }
  | { v: 1; t: 'sos'; from: string; packet: SosPacket };

export type QueueKind = 'msg' | 'ack' | 'sos';

export interface QueueItem {
  id: string;
  kind: QueueKind;
  packet: MsgPacket | AckPacket | SosPacket;
  priority: number; // higher goes first
  isOwn: boolean;
  sendMode: SendMode;
  sourceNode: string | null; // bsId of the phone we got it from
  expiresAt: number;
  createdAt: number;
}

// ============================================================================
// Nearby phones
// ============================================================================

export type LinkType = 'nearby' | 'ble';

export interface Peer {
  nodeId: string; // BartaSetu ID of the phone's owner
  bsId: string;
  userId?: string;
  displayName?: string;
  publicKey?: string;
  hasInternet: boolean;
  battery: number;
  rssi?: number;
  distanceMeters?: number | null;
  lat?: number | null;
  lon?: number | null;
  nearbyEndpoint?: string; // Nearby Connections endpoint id
  nearbyConnected: boolean;
  bleAddress?: string;
  bleSeenAt?: number;
  bleFirstSeen?: number;
  lastSeen: number;
  relayedCount: number;
}

export interface NearbySosAlert {
  id: string;
  name: string;
  bsId: string;
  message: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  battery: number | null;
  receivedAt: number;
  hopCount: number;
}
