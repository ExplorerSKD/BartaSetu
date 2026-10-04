/**
 * useSOSStore.ts
 * Zustand state store for Emergency SOS broadcasting and alerts in BartaSetu mobile.
 * Coordinates GPS coordinate tagging, battery telemetry, offline queueing,
 * direct FastAPI alert upload, and real-time WebSocket SOS alert listening.
 */

import { create } from 'zustand';
import { apiService } from '../services/ApiService';
import { webSocketService } from '../services/WebSocketService';
import { LocationService } from '../services/LocationService';
import { dbService } from '../database/DatabaseService';
import { EmergencyType, LocalSOSAlert, SOSCreate, SOSResponse } from '../types';

interface SOSState {
  activeAlerts: SOSResponse[];
  isTriggering: boolean;
  selectedEmergencyType: EmergencyType;
  error: string | null;

  // Actions
  triggerSOS: (customMessage?: string, emergencyType?: EmergencyType) => Promise<SOSResponse | null>;
  addAlert: (alert: SOSResponse) => Promise<void>;
  resolveSOS: (alertId: string) => Promise<void>;
  loadAlerts: () => Promise<void>;
  setSelectedEmergencyType: (type: EmergencyType) => void;
  clearAlerts: () => void;
}

export const useSOSStore = create<SOSState>((set, get) => {
  // Listen for real-time SOS broadcasts over WebSocket
  webSocketService.onSOSAlert(async (alert: SOSResponse) => {
    await get().addAlert(alert);
  });

  return {
    activeAlerts: [],
    isTriggering: false,
    selectedEmergencyType: 'General Emergency',
    error: null,

    setSelectedEmergencyType: (type: EmergencyType) => {
      set({ selectedEmergencyType: type });
    },

    triggerSOS: async (customMessage?: string, emergencyType?: EmergencyType) => {
      set({ isTriggering: true, error: null });
      const currentType = emergencyType || get().selectedEmergencyType;

      try {
        // 1. Get current GPS Coordinates
        const location = await LocationService.getCurrentLocation();

        // 2. Mock battery reading (45% simulated standard)
        const batteryLevel = 85;
        const deviceId = `dev_${Date.now().toString(36)}`;
        const messageText =
          customMessage || `EMERGENCY SOS: ${currentType}! Immediate assistance needed.`;

        const sosPayload: SOSCreate = {
          device_id: deviceId,
          message: messageText,
          latitude: location.latitude,
          longitude: location.longitude,
          battery_level: batteryLevel,
          emergency_type: currentType
        };

        const sosId = `sos_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const nowIso = new Date().toISOString();

        let sosResponse: SOSResponse = {
          id: sosId,
          user_id: 'current_user',
          device_id: deviceId,
          message: messageText,
          latitude: location.latitude,
          longitude: location.longitude,
          battery_level: batteryLevel,
          status: 'ACTIVE',
          created_at: nowIso,
          resolved_at: null
        };

        // 3. Save to local SQLite database
        const localAlert: LocalSOSAlert = {
          ...sosResponse,
          is_synced: 0
        };
        await dbService.saveSOSAlert(localAlert);

        // 4. Try sending to FastAPI server if online
        try {
          const remoteResponse = await apiService.createSOS(sosPayload);
          sosResponse = remoteResponse;
          await dbService.updateSOSAlertStatus(sosResponse.id, sosResponse.status, true);
        } catch (apiErr) {
          console.warn('Direct SOS upload failed (offline), saved to SQLite for BLE mesh dispatch:', apiErr);
        }

        // 5. Update local state
        const currentAlerts = get().activeAlerts;
        const nextAlerts = [sosResponse, ...currentAlerts.filter((a) => a.id !== sosResponse.id)];
        set({
          activeAlerts: nextAlerts,
          isTriggering: false,
          error: null
        });

        return sosResponse;
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to trigger SOS emergency alert';
        set({ isTriggering: false, error: errorMsg });
        return null;
      }
    },

    addAlert: async (alert: SOSResponse) => {
      const localAlert: LocalSOSAlert = {
        ...alert,
        is_synced: 1
      };
      await dbService.saveSOSAlert(localAlert);

      const current = get().activeAlerts;
      const exists = current.some((a) => a.id === alert.id);
      const nextAlerts = exists
        ? current.map((a) => (a.id === alert.id ? alert : a))
        : [alert, ...current];

      set({ activeAlerts: nextAlerts });
    },

    resolveSOS: async (alertId: string) => {
      try {
        await dbService.updateSOSAlertStatus(alertId, 'RESOLVED', true);
        const current = get().activeAlerts;
        const nextAlerts = current.map((a) =>
          a.id === alertId ? { ...a, status: 'RESOLVED', resolved_at: new Date().toISOString() } : a
        );
        set({ activeAlerts: nextAlerts });
      } catch (err: any) {
        console.warn('Failed to resolve SOS alert:', err);
      }
    },

    loadAlerts: async () => {
      try {
        // Load local SQLite alerts
        const localAlerts = await dbService.getAllSOSAlerts();
        set({ activeAlerts: localAlerts });

        // If online, also try to fetch latest from server
        try {
          const remoteAlerts = await apiService.getSOSAlerts();
          if (remoteAlerts && remoteAlerts.length > 0) {
            set({ activeAlerts: remoteAlerts });
            for (const rem of remoteAlerts) {
              await dbService.saveSOSAlert({ ...rem, is_synced: 1 });
            }
          }
        } catch {}
      } catch (err: any) {
        console.warn('Failed to load SOS alerts:', err);
      }
    },

    clearAlerts: () => {
      set({ activeAlerts: [] });
    }
  };
});
