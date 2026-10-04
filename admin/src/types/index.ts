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
  bsId?: string | null;
  username?: string;
  isOnline?: boolean;
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
  status: string;
  routePreview: string;
  timestamp: string;
}

export interface SOSAlertItem {
  id: string;
  userId: string;
  deviceId: string;
  message?: string;
  location: { lat: number; lon: number } | null;
  batteryLevel: number;
  timestamp: string;
  resolved: boolean;
}

export interface MeshRouteHop {
  deviceId: string;
  timestamp: string;
}
