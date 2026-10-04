/**
 * LocationService.ts
 * GPS Location Service and Geospatial calculations for BartaSetu mobile.
 * Implements GPS location acquisition with permission handling,
 * and high-precision Haversine distance formula in meters.
 */

import { LocationCoordinates } from '../types';

export class LocationService {
  private static lastKnownLocation: LocationCoordinates = {
    latitude: 23.8103, // Default Dhaka coordinates
    longitude: 90.4125,
    accuracy: 10,
    timestamp: Date.now()
  };

  private static watchSubscription: any = null;

  /**
   * Implements the Haversine distance formula.
   * Calculates great-circle distance between two GPS coordinates in meters.
   *
   * @param lat1 Latitude of point 1 in degrees
   * @param lon1 Longitude of point 1 in degrees
   * @param lat2 Latitude of point 2 in degrees
   * @param lon2 Longitude of point 2 in degrees
   * @returns Distance in meters
   */
  public static haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's mean radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Formats distance in meters into human-readable string (e.g. "45m" or "1.2 km")
   */
  public static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  /**
   * Fetch current GPS location coordinates.
   * Gracefully degrades to native Geolocation or cached/fallback coordinates.
   */
  public static async getCurrentLocation(): Promise<LocationCoordinates> {
    try {
      // 1. Attempt expo-location if available
      const Location = await import('expo-location');
      if (Location && Location.requestForegroundPermissionsAsync) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          });
          const coords: LocationCoordinates = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy || 10,
            altitude: loc.coords.altitude,
            heading: loc.coords.heading,
            speed: loc.coords.speed,
            timestamp: loc.timestamp
          };
          this.lastKnownLocation = coords;
          return coords;
        }
      }
    } catch {
      // expo-location not linked or unavailable
    }

    // 2. Attempt standard navigator.geolocation (Web / React Native polyfill)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise<LocationCoordinates>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords: LocationCoordinates = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy || 15,
              altitude: pos.coords.altitude,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
              timestamp: pos.timestamp
            };
            this.lastKnownLocation = coords;
            resolve(coords);
          },
          (err) => {
            console.warn('Geolocation error, returning fallback:', err);
            resolve(this.getSimulatedLocation());
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
        );
      });
    }

    // 3. Fallback to simulated coordinates with slight jitter
    return this.getSimulatedLocation();
  }

  /**
   * Watch location changes continuously
   */
  public static async watchLocation(
    callback: (location: LocationCoordinates) => void
  ): Promise<() => void> {
    try {
      const Location = await import('expo-location');
      if (Location && Location.watchPositionAsync) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 5 // every 5 meters
            },
            (loc) => {
              const coords: LocationCoordinates = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy || 10,
                altitude: loc.coords.altitude,
                timestamp: loc.timestamp
              };
              this.lastKnownLocation = coords;
              callback(coords);
            }
          );
          return () => sub.remove();
        }
      }
    } catch {
      // Fallback watch simulation interval
    }

    const intervalId = setInterval(async () => {
      const loc = await this.getCurrentLocation();
      callback(loc);
    }, 15000);

    return () => clearInterval(intervalId);
  }

  /**
   * Get last cached location
   */
  public static getLastKnownLocation(): LocationCoordinates {
    return { ...this.lastKnownLocation };
  }

  /**
   * Generates location with small random offset for realistic simulator testing
   */
  private static getSimulatedLocation(): LocationCoordinates {
    const jitterLat = (Math.random() - 0.5) * 0.002;
    const jitterLon = (Math.random() - 0.5) * 0.002;
    const simulated: LocationCoordinates = {
      latitude: Number((this.lastKnownLocation.latitude + jitterLat).toFixed(6)),
      longitude: Number((this.lastKnownLocation.longitude + jitterLon).toFixed(6)),
      accuracy: 12,
      timestamp: Date.now()
    };
    this.lastKnownLocation = simulated;
    return simulated;
  }
}
