import { create } from 'zustand';
import { KnownDevice, LocalMessage, MessageStatus } from '../types';

export interface MeshState {
  // Device & Mesh network state
  known_devices: KnownDevice[];
  isMeshActive: boolean;
  isOnline: boolean;
  meshStatus: 'IDLE' | 'STARTING' | 'ACTIVE' | 'STOPPED' | 'ERROR';
  activeConnectionsCount: number;
  relayedCount: number;
  hopsSavedCount: number;

  // Messages state
  messages: LocalMessage[];

  // Actions
  setKnownDevices: (devices: KnownDevice[]) => void;
  upsertDevice: (device: KnownDevice) => void;
  removeDevice: (deviceId: string) => void;
  setMeshActive: (active: boolean) => void;
  setIsOnline: (isOnline: boolean) => void;
  setMeshStatus: (status: 'IDLE' | 'STARTING' | 'ACTIVE' | 'STOPPED' | 'ERROR') => void;
  setActiveConnectionsCount: (count: number) => void;
  incrementRelayedCount: () => void;
  incrementHopsSaved: (hops?: number) => void;

  setMessages: (messages: LocalMessage[]) => void;
  addMessage: (message: LocalMessage) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus) => void;
  clearStore: () => void;
}

export const useMeshStore = create<MeshState>((set) => ({
  known_devices: [],
  isMeshActive: false,
  isOnline: false,
  meshStatus: 'IDLE',
  activeConnectionsCount: 0,
  relayedCount: 0,
  hopsSavedCount: 0,
  messages: [],

  setKnownDevices: (devices) => set({ known_devices: devices }),

  upsertDevice: (device) =>
    set((state) => {
      const devId = device.id || device.device_id;
      const existingIdx = state.known_devices.findIndex(
        (d) => (d.id === devId || d.device_id === devId)
      );
      if (existingIdx >= 0) {
        const updated = [...state.known_devices];
        updated[existingIdx] = { ...updated[existingIdx], ...device };
        return { known_devices: updated };
      }
      return { known_devices: [device, ...state.known_devices] };
    }),

  removeDevice: (deviceId) =>
    set((state) => ({
      known_devices: state.known_devices.filter((d) => d.id !== deviceId && d.device_id !== deviceId),
    })),

  setMeshActive: (isMeshActive) => set({ isMeshActive }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setMeshStatus: (meshStatus) => set({ meshStatus }),
  setActiveConnectionsCount: (activeConnectionsCount) => set({ activeConnectionsCount }),
  
  incrementRelayedCount: () =>
    set((state) => ({ relayedCount: state.relayedCount + 1 })),
    
  incrementHopsSaved: (hops = 1) =>
    set((state) => ({ hopsSavedCount: state.hopsSavedCount + hops })),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => {
      const exists = state.messages.some((m) => m.id === message.id);
      if (exists) {
        return {
          messages: state.messages.map((m) => (m.id === message.id ? message : m)),
        };
      }
      return { messages: [message, ...state.messages] };
    }),

  updateMessageStatus: (messageId, status) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, status, updated_at: new Date().toISOString() } : m
      ),
    })),

  clearStore: () =>
    set({
      known_devices: [],
      isMeshActive: false,
      isOnline: false,
      meshStatus: 'IDLE',
      activeConnectionsCount: 0,
      relayedCount: 0,
      hopsSavedCount: 0,
      messages: [],
    }),
}));

export default useMeshStore;
