import axios from 'axios';
import { AdminStats, UserItem, DeviceItem, MessageItem, SOSAlertItem } from '../types';

// Override with VITE_API_URL in admin/.env when the backend tunnel URL changes
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://bartasetu.srv1857933.hstgr.cloud',
});

export const getStats = async (): Promise<AdminStats> => {
  const response = await api.get('/admin/stats');
  return response.data;
};

export const getUsers = async (): Promise<UserItem[]> => {
  const response = await api.get('/admin/users');
  return response.data;
};

export const getDevices = async (): Promise<DeviceItem[]> => {
  const response = await api.get('/admin/devices');
  return response.data;
};

export const getMessages = async (): Promise<MessageItem[]> => {
  const response = await api.get('/admin/messages');
  return response.data;
};

export const getSOSAlerts = async (): Promise<SOSAlertItem[]> => {
  const response = await api.get('/admin/sos');
  return response.data;
};

export const resolveSOSAlert = async (id: string): Promise<void> => {
  await api.post(`/admin/sos/${id}/resolve`);
};
