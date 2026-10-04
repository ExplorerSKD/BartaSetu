/**
 * Thin typed wrapper around the native MeshModule (Kotlin), which runs:
 *  - Nearby Connections (Bluetooth discovery + Wi-Fi upgrade) as the main phone-to-phone link
 *  - raw BLE GATT as a fallback
 * There is no simulation: if the native module is missing (e.g. Expo Go), nearby features are off.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { LinkType } from '../types';

export interface LocalInfo {
  bsId: string;
  hasInternet: boolean;
  battery: number;
}

export interface PeerFoundEvent {
  peerId: string;
  transport: LinkType;
  bsId?: string;
  hasInternet?: boolean;
  battery?: number;
  rssi?: number;
}

export interface PeerEvent {
  peerId: string;
  transport: LinkType;
}

export interface PayloadEvent {
  peerId: string;
  transport: LinkType;
  data: string;
}

export interface TransportState {
  nearby: boolean;
  ble: boolean;
}

const Native = Platform.OS === 'android' ? NativeModules.MeshModule : null;
const emitter = Native ? new NativeEventEmitter(Native) : null;

export const transport = {
  isAvailable(): boolean {
    return Native != null;
  },

  async isNearbyAvailable(): Promise<boolean> {
    if (!Native) return false;
    try {
      return Boolean(await Native.isNearbyAvailable());
    } catch {
      return false;
    }
  },

  async start(info: LocalInfo, options: { useNearby?: boolean; useBle?: boolean } = {}): Promise<TransportState> {
    if (!Native) return { nearby: false, ble: false };
    const result = await Native.start({ ...info, useNearby: options.useNearby ?? true, useBle: options.useBle ?? true });
    return { nearby: Boolean(result?.nearby), ble: Boolean(result?.ble) };
  },

  updateLocalInfo(info: LocalInfo): void {
    Native?.updateLocalInfo(info);
  },

  async send(peerId: string, link: LinkType, data: string): Promise<boolean> {
    if (!Native) return false;
    try {
      return Boolean(await Native.send(peerId, link, data));
    } catch {
      return false;
    }
  },

  /** Restart radios that should be running but are not; returns the real state. */
  async ensureRunning(): Promise<TransportState & { bluetoothOn: boolean; backgroundAllowed: boolean }> {
    if (!Native?.ensureRunning) return { nearby: false, ble: false, bluetoothOn: false, backgroundAllowed: true };
    try {
      const r = await Native.ensureRunning();
      return {
        nearby: Boolean(r?.nearby),
        ble: Boolean(r?.ble),
        bluetoothOn: Boolean(r?.bluetoothOn),
        backgroundAllowed: r?.backgroundAllowed !== false,
      };
    } catch {
      return { nearby: false, ble: false, bluetoothOn: false, backgroundAllowed: true };
    }
  },

  /** Opens Android's "don't optimise battery for this app" prompt. */
  requestBackgroundRun(): void {
    try {
      Native?.requestBackgroundRun?.();
    } catch {
      // not supported
    }
  },

  /** System heads-up notification (works while the app is in the background). */
  notify(kind: 'sos' | 'message', title: string, body: string): void {
    try {
      Native?.showNotification?.(kind, title, body);
    } catch {
      // native build without notification support
    }
  },

  async stop(): Promise<void> {
    if (!Native) return;
    try {
      await Native.stop();
    } catch {
      // already stopped
    }
  },

  onPeerFound(cb: (e: PeerFoundEvent) => void) {
    const sub = emitter?.addListener('MeshPeerFound', cb);
    return () => sub?.remove();
  },
  onPeerLost(cb: (e: PeerEvent) => void) {
    const sub = emitter?.addListener('MeshPeerLost', cb);
    return () => sub?.remove();
  },
  onPeerConnected(cb: (e: PeerFoundEvent) => void) {
    const sub = emitter?.addListener('MeshPeerConnected', cb);
    return () => sub?.remove();
  },
  onPeerDisconnected(cb: (e: PeerEvent) => void) {
    const sub = emitter?.addListener('MeshPeerDisconnected', cb);
    return () => sub?.remove();
  },
  onPayload(cb: (e: PayloadEvent) => void) {
    const sub = emitter?.addListener('MeshPayload', cb);
    return () => sub?.remove();
  },
  onTransportState(cb: (e: TransportState) => void) {
    const sub = emitter?.addListener('MeshTransportState', cb);
    return () => sub?.remove();
  },
};
