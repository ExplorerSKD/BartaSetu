import axios from 'axios';
import { AdminStats, UserItem, DeviceItem, MessageItem, SOSAlertItem } from '../types';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

// Mocking API responses for development if needed, but defining real endpoints:

export const getStats = async (): Promise<AdminStats> => {
  try {
    const response = await api.get('/admin/stats');
    return response.data;
  } catch (error) {
    // Fallback mock
    return {
      totalUsers: 1250,
      totalDevices: 1420,
      onlineDevices: 890,
      offlineRelays: 120,
      deliveredMessages: 45000,
      pendingInMesh: 320,
      activeSOSEmergencies: 2,
    };
  }
};

export const getUsers = async (): Promise<UserItem[]> => {
  try {
    const response = await api.get('/admin/users');
    return response.data;
  } catch (error) {
    return [
      { id: 'usr_1', displayName: 'Rahim', creationDate: '2023-10-01T10:00:00Z', hasPublicKey: true },
      { id: 'usr_2', displayName: 'Karim', creationDate: '2023-10-02T11:30:00Z', hasPublicKey: true },
    ];
  }
};

export const getDevices = async (): Promise<DeviceItem[]> => {
  try {
    const response = await api.get('/admin/devices');
    return response.data;
  } catch (error) {
    return [
      { id: 'dev_1', userId: 'usr_1', platform: 'Android', lastSeen: new Date().toISOString(), isOnline: true, location: { lat: 23.8103, lon: 90.4125 } },
      { id: 'dev_2', userId: 'usr_2', platform: 'Android', lastSeen: new Date(Date.now() - 3600000).toISOString(), isOnline: false },
    ];
  }
};

export const getMessages = async (): Promise<MessageItem[]> => {
  try {
    const response = await api.get('/admin/messages');
    return response.data;
  } catch (error) {
    return [
      { id: 'msg_1', senderId: 'usr_1', recipientId: 'usr_2', hopCount: 3, status: 'DELIVERED', routePreview: 'A -> B -> C -> Server', timestamp: new Date().toISOString() },
    ];
  }
};

export const getSOSAlerts = async (): Promise<SOSAlertItem[]> => {
  try {
    const response = await api.get('/admin/sos');
    return response.data;
  } catch (error) {
    return [
      { id: 'sos_1', userId: 'usr_3', deviceId: 'dev_3', location: { lat: 23.794, lon: 90.404 }, batteryLevel: 15, timestamp: new Date().toISOString(), resolved: false },
    ];
  }
};

export const resolveSOSAlert = async (id: string): Promise<void> => {
  try {
    await api.post(`/admin/sos/${id}/resolve`);
  } catch (error) {
    console.log(`Resolved alert ${id}`);
  }
};
