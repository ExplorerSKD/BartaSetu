/**
 * Android runtime permissions needed to find and talk to nearby phones.
 */

import { PermissionsAndroid, Permission, Platform } from 'react-native';

const P = PermissionsAndroid.PERMISSIONS;

function nearbyPermissions(): Permission[] {
  if (Platform.OS !== 'android') return [];
  const version = Number(Platform.Version);
  const list: Permission[] = [P.ACCESS_FINE_LOCATION, P.ACCESS_COARSE_LOCATION];
  if (version >= 31) {
    list.push(P.BLUETOOTH_SCAN, P.BLUETOOTH_ADVERTISE, P.BLUETOOTH_CONNECT);
  }
  if (version >= 33) {
    list.push(P.NEARBY_WIFI_DEVICES, P.POST_NOTIFICATIONS);
  }
  return list.filter(Boolean);
}

export const permissions = {
  async hasNearby(): Promise<boolean> {
    const list = nearbyPermissions();
    if (list.length === 0) return true;
    const checks = await Promise.all(
      list.filter((p) => p !== P.POST_NOTIFICATIONS).map((p) => PermissionsAndroid.check(p)),
    );
    return checks.every(Boolean);
  },

  /** Ask for everything the mesh needs. Returns true when the essential permissions are granted. */
  async requestNearby(): Promise<boolean> {
    const list = nearbyPermissions();
    if (list.length === 0) return true;
    const result = await PermissionsAndroid.requestMultiple(list);
    return list
      .filter((p) => p !== P.POST_NOTIFICATIONS && p !== P.ACCESS_COARSE_LOCATION)
      .every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
  },

  async hasLocation(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    return PermissionsAndroid.check(P.ACCESS_FINE_LOCATION);
  },
};
