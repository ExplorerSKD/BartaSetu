/**
 * Phone state used for routing decisions and SOS: battery level and GPS position.
 * Never invents values; returns null when unavailable.
 */

import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { permissions } from './permissions';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

let lastLocation: Coordinates | null = null;

export const device = {
  async batteryPercent(): Promise<number> {
    try {
      const level = await Battery.getBatteryLevelAsync();
      return level >= 0 ? Math.round(level * 100) : 100;
    } catch {
      return 100;
    }
  },

  lastKnownLocation(): Coordinates | null {
    return lastLocation;
  },

  /** Quick location for routing (cached or last known, no prompt). */
  async approximateLocation(): Promise<Coordinates | null> {
    if (lastLocation && Date.now() - lastLocation.timestamp < 5 * 60_000) return lastLocation;
    try {
      if (!(await permissions.hasLocation())) return lastLocation;
      const known = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
      if (known) lastLocation = fromExpo(known);
    } catch {
      // location services off
    }
    return lastLocation;
  },

  /** Fresh GPS fix for SOS; asks for permission if needed. */
  async preciseLocation(): Promise<Coordinates | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return lastLocation;
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      lastLocation = fromExpo(fix);
    } catch {
      // GPS unavailable: fall back to whatever we had
    }
    return lastLocation;
  },
};

function fromExpo(loc: Location.LocationObject): Coordinates {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    timestamp: loc.timestamp,
  };
}
