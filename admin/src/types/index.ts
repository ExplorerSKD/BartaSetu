export interface AdminStats {
  totalUsers: number;
  totalDevices: number;
  onlineDevices: number;
  offlineRelays: number;
  deliveredMessages: number;
  pendingInMesh: number;
  activeSOSEmergencies: number;
}

export interface UserItem {
  id: string;
  displayName: string;
  creationDate: string;
  hasPublicKey: boolean;
}

export interface DeviceItem {
  id: string;
  userId: string;
  platform: string;
  lastSeen: string;
  isOnline: boolean;
  location?: { lat: number; lon: number };
}

export interface MessageItem {
  id: string;
  senderId: string;
  recipientId: string;
  hopCount: number;
  status: 'SERVER_RECEIVED' | 'DELIVERED' | 'RELAYED';
  routePreview: string;
  timestamp: string;
}

export interface SOSAlertItem {
  id: string;
  userId: string;
  deviceId: string;
  location: { lat: number; lon: number };
  batteryLevel: number;
  timestamp: string;
  resolved: boolean;
}

export interface MeshRouteHop {
  deviceId: string;
  timestamp: string;
}
