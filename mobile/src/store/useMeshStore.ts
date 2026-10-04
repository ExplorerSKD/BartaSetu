/**
 * useMeshStore.ts
 * Zustand state store for BLE Mesh Network and Peer Discovery in BartaSetu mobile.
 * Manages internet connectivity status, BLE mesh active state,
 * nearby peer devices, routing scores, and mesh relay statistics.
 */

import { create } from 'zustand';
import { messageService } from '../services/MessageService';
import { RelayScorer } from '../services/RelayScorer';
import { dbService } from '../database/DatabaseService';
import { MeshDevice, MeshStats } from '../types';

interface MeshState {
  isOnline: boolean;
  isMeshActive: boolean;
  nearbyDevices: MeshDevice[];
  relayedCount: number;
  stats: MeshStats;

  // Actions
  setIsOnline: (online: boolean) => void;
  toggleMesh: (active?: boolean) => void;
  addDiscoveredDevice: (device: Omit<MeshDevice, 'relayScore'> & { relayScore?: number }) => void;
  removeDevice: (deviceId: string) => void;
  updateDevice: (deviceId: string, partial: Partial<MeshDevice>) => void;
  incrementRelayedCount: () => void;
  clearNearbyDevices: () => void;
  loadSavedDevices: () => Promise<void>;
}

export const useMeshStore = create<MeshState>((set, get) => ({
  isOnline: false,
  isMeshActive: true,
  nearbyDevices: [],
  relayedCount: 0,
  stats: {
    messagesRelayed: 0,
    hopsSaved: 0,
    activePeersCount: 0,
    lastRelayTimestamp: null
  },

  setIsOnline: (online: boolean) => {
    set({ isOnline: online });
    // Notify MessageService to trigger auto-sync if transitioning offline -> online
    messageService.setOnlineStatus(online);
  },

  toggleMesh: (active?: boolean) => {
    const nextActive = active !== undefined ? active : !get().isMeshActive;
    set({ isMeshActive: nextActive });
  },

  addDiscoveredDevice: (deviceData) => {
    const current = get().nearbyDevices;

    // Calculate intelligent relay score if not pre-computed
    const relayScore =
      deviceData.relayScore !== undefined
        ? deviceData.relayScore
        : RelayScorer.calculateRelayScore({
            deviceId: deviceData.id,
            hasInternet: deviceData.hasInternet,
            rssi: deviceData.rssi,
            distanceMeters: deviceData.distanceMeters || 10,
            batteryLevel: deviceData.batteryLevel,
            previousSuccessRate: 0.9,
            destinationProximityMeters: deviceData.distanceMeters
          });

    const fullDevice: MeshDevice = {
      ...deviceData,
      relayScore: Math.round(relayScore),
      lastSeen: Date.now()
    };

    const existsIndex = current.findIndex((d) => d.id === fullDevice.id);
    let nextDevices: MeshDevice[];

    if (existsIndex >= 0) {
      nextDevices = [...current];
      nextDevices[existsIndex] = fullDevice;
    } else {
      nextDevices = [...current, fullDevice];
    }

    // Rank devices by relay score
    nextDevices.sort((a, b) => b.relayScore - a.relayScore);

    set((state) => ({
      nearbyDevices: nextDevices,
      stats: {
        ...state.stats,
        activePeersCount: nextDevices.length
      }
    }));

    // Persist to local database
    dbService.saveMeshDevice(fullDevice).catch((err) => {
      console.warn('Failed to save mesh device to SQLite:', err);
    });
  },

  removeDevice: (deviceId: string) => {
    set((state) => {
      const nextDevices = state.nearbyDevices.filter((d) => d.id !== deviceId);
      return {
        nearbyDevices: nextDevices,
        stats: {
          ...state.stats,
          activePeersCount: nextDevices.length
        }
      };
    });
  },

  updateDevice: (deviceId: string, partial: Partial<MeshDevice>) => {
    set((state) => {
      const nextDevices = state.nearbyDevices.map((d) =>
        d.id === deviceId ? { ...d, ...partial, lastSeen: Date.now() } : d
      );
      nextDevices.sort((a, b) => b.relayScore - a.relayScore);
      return { nearbyDevices: nextDevices };
    });
  },

  incrementRelayedCount: () => {
    set((state) => ({
      relayedCount: state.relayedCount + 1,
      stats: {
        ...state.stats,
        messagesRelayed: state.stats.messagesRelayed + 1,
        hopsSaved: state.stats.hopsSaved + 1,
        lastRelayTimestamp: Date.now()
      }
    }));
  },

  clearNearbyDevices: () => {
    set((state) => ({
      nearbyDevices: [],
      stats: {
        ...state.stats,
        activePeersCount: 0
      }
    }));
  },

  loadSavedDevices: async () => {
    try {
      const saved = await dbService.getMeshDevices();
      if (saved && saved.length > 0) {
        set((state) => ({
          nearbyDevices: saved,
          stats: {
            ...state.stats,
            activePeersCount: saved.length
          }
        }));
      }
    } catch (err) {
      console.warn('Error loading saved mesh devices:', err);
    }
  }
}));
