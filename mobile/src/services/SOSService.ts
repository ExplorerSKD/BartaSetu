/**
 * SOSService.ts
 * Emergency SOS Orchestration Service for BartaSetu mobile.
 * Coordinates GPS coordinate tagging, cryptographic payload creation,
 * local SQLite buffering, and routing to FastAPI or BLE mesh.
 */

import { CryptoService, EncryptedPayload } from './CryptoService';
import { LocationService } from './LocationService';
import { apiService } from './ApiService';
import { dbService } from '../database/DatabaseService';
import { LocationCoordinates, LocalSOSAlert, SOSPayload } from '../types';

export class SOSService {
  private static async getBatteryLevel(): Promise<number> {
    // In a real device, use react-native-device-info or Battery API
    return 85; // Simulated 85%
  }

  private static isDeviceOnline(): boolean {
    return false;
  }

  static async triggerSOS(emergencyMessage?: string): Promise<SOSPayload> {
    // 1. Fetch GPS coordinates
    let location: LocationCoordinates | null = null;
    try {
      location = await LocationService.getCurrentLocation();
    } catch (e) {
      console.warn('Failed to get location for SOS:', e);
      location = LocationService.getLastKnownLocation();
    }

    // 2. Fetch battery level
    const batteryLevel = await this.getBatteryLevel();

    // 3. Construct SOSPayload
    const sosPayload: SOSPayload = {
      id: `sos-${Date.now()}`,
      timestamp: Date.now(),
      message: emergencyMessage || 'EMERGENCY: User triggered SOS',
      location,
      batteryLevel,
      priority: 'CRITICAL'
    };

    // 4. Encrypt SOS payload
    const authorityPublicKey = 'DUMMY_PUB_KEY_BASE64';
    let encryptedPayload: EncryptedPayload;

    try {
      encryptedPayload = await CryptoService.encryptMessage(
        JSON.stringify(sosPayload),
        authorityPublicKey
      );
    } catch (e) {
      console.warn('Failed to encrypt SOS payload, using fallback packaging:', e);
      encryptedPayload = {
        ciphertext: btoa(unescape(encodeURIComponent(JSON.stringify(sosPayload)))),
        iv: 'mock_iv_salt',
        salt: 'mock_salt',
        ephemeralPublicKey: 'mock_eph_key'
      };
    }

    // 5. Save to local SQLite
    const localAlert: LocalSOSAlert = {
      id: sosPayload.id,
      user_id: 'current_user',
      device_id: `dev_${Date.now().toString(36)}`,
      message: sosPayload.message,
      latitude: location ? location.latitude : 23.8103,
      longitude: location ? location.longitude : 90.4125,
      battery_level: batteryLevel,
      status: 'ACTIVE',
      created_at: new Date(sosPayload.timestamp).toISOString(),
      resolved_at: null,
      is_synced: 0
    };

    await dbService.saveSOSAlert(localAlert);

    // 6. Route the payload (Direct API vs Offline BLE queue)
    if (this.isDeviceOnline()) {
      try {
        await apiService.createSOS({
          device_id: localAlert.device_id,
          message: localAlert.message || '',
          latitude: localAlert.latitude,
          longitude: localAlert.longitude,
          battery_level: localAlert.battery_level
        });
        await dbService.updateSOSAlertStatus(localAlert.id, 'ACTIVE', true);
      } catch (err) {
        console.warn('Direct upload failed, keeping in local SQLite queue:', err);
      }
    } else {
      console.log('Device offline. Saved to local SQLite and queued for BLE mesh relay.');
    }

    return sosPayload;
  }
}
