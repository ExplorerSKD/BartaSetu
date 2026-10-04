/**
 * Starts and stops everything that runs while a user is signed in:
 * local database, encryption keys, connectivity monitoring, WebSocket, and the offline mesh.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { API_URL } from '../config';
import { User } from '../types';
import { api, Tokens } from './api';
import { crypto } from './crypto';
import { database } from './db';
import { device } from './device';
import { mesh } from './mesh';
import { permissions } from './permissions';
import { realtime } from './realtime';
import { useMeshStore } from '../store/useMeshStore';

const KEYS = {
  tokens: 'bartasetu.tokens',
  user: 'bartasetu.user',
  deviceId: (userId: string) => `bartasetu.device.${userId}`,
  onboarded: 'bartasetu.onboarded',
};

NetInfo.configure({
  // "Online" means the BartaSetu server is reachable, not just that Wi-Fi is on
  reachabilityUrl: `${API_URL}/health`,
  reachabilityTest: async (response) => response.status === 200,
  reachabilityShortTimeout: 15_000,
  reachabilityLongTimeout: 60_000,
  reachabilityRequestTimeout: 8_000,
});

let active: User | null = null;
let cleanups: Array<() => void> = [];
let serverSetupDone = false;

export const session = {
  // ----------------------------------------------------------------- storage
  async loadSaved(): Promise<{ user: User; tokens: Tokens } | null> {
    try {
      const [tokensRaw, userRaw] = await Promise.all([
        SecureStore.getItemAsync(KEYS.tokens),
        AsyncStorage.getItem(KEYS.user),
      ]);
      if (!tokensRaw || !userRaw) return null;
      return { tokens: JSON.parse(tokensRaw), user: JSON.parse(userRaw) };
    } catch {
      return null;
    }
  },

  async save(user: User, tokens: Tokens): Promise<void> {
    await SecureStore.setItemAsync(KEYS.tokens, JSON.stringify(tokens));
    await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
  },

  async clearSaved(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.tokens);
    await AsyncStorage.removeItem(KEYS.user);
  },

  async hasOnboarded(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.onboarded)) === '1';
  },

  async setOnboarded(): Promise<void> {
    await AsyncStorage.setItem(KEYS.onboarded, '1');
  },

  // ----------------------------------------------------------------- lifecycle
  async start(user: User, tokens: Tokens): Promise<void> {
    if (active?.id === user.id) return;
    if (active) await this.stop();
    active = user;
    serverSetupDone = false;

    api.setTokens(tokens);
    api.onTokensChanged((next) => {
      if (next) void SecureStore.setItemAsync(KEYS.tokens, JSON.stringify(next));
    });

    await database.open(user.id);
    const publicKey = await crypto.loadIdentity(user.id);
    await mesh.start(user, publicKey);
    void device.approximateLocation();

    // Radios only start once the user granted nearby permissions (asked during onboarding)
    if (await permissions.hasNearby()) {
      await mesh.startRadios();
    }

    const applyNetwork = (state: NetInfoState) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable === true;
      mesh.setOnline(online);
      if (online) {
        void setUpWithServer(user, publicKey);
        realtime.reconnectNow();
      }
    };
    cleanups.push(NetInfo.addEventListener(applyNetwork));
    NetInfo.fetch().then(applyNetwork);

    realtime.start(
      {
        onMessage: (msg) => void mesh.handleServerMessage(msg),
        onAck: (id, status) => void mesh.handleServerAck(id, status),
        onSos: (alert) => void mesh.handleServerSos(alert),
        onConnected: () => {
          useMeshStore.getState().set({ serverConnected: true });
          void mesh.syncWithServer();
        },
        onDisconnected: () => useMeshStore.getState().set({ serverConnected: false }),
      },
      await AsyncStorage.getItem(KEYS.deviceId(user.id)),
    );

    const onAppState = async (state: AppStateStatus) => {
      if (state === 'active') {
        NetInfo.refresh();
        if (mesh.isOnline()) void mesh.syncWithServer();
        if (await permissions.hasNearby()) await mesh.startRadios();
      }
    };
    const appStateSub = AppState.addEventListener('change', onAppState);
    cleanups.push(() => appStateSub.remove());
  },

  /** Ask for nearby permissions (from onboarding or the Nearby tab) and start the radios. */
  async enableNearby(): Promise<boolean> {
    const granted = await permissions.requestNearby();
    useMeshStore.getState().set({ permissionsGranted: granted });
    if (granted && active) await mesh.startRadios();
    return granted;
  },

  async stop(): Promise<void> {
    cleanups.forEach((c) => c());
    cleanups = [];
    realtime.stop();
    await mesh.stop();
    await database.close();
    crypto.clearIdentity();
    api.setTokens(null);
    active = null;
  },

  currentUser(): User | null {
    return active;
  },
};

/** Once per session while online: publish our public key and register this phone. */
async function setUpWithServer(user: User, publicKey: string): Promise<void> {
  if (serverSetupDone) return;
  serverSetupDone = true;
  try {
    await api.uploadPublicKey(publicKey);
    const location = device.lastKnownLocation();
    const savedId = await AsyncStorage.getItem(KEYS.deviceId(user.id));
    const registered = await api.registerDevice({
      id: savedId,
      device_name: `${Platform.OS === 'android' ? 'Android' : 'Phone'} ${Platform.Version}`,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    });
    if (registered.id !== savedId) await AsyncStorage.setItem(KEYS.deviceId(user.id), registered.id);
  } catch (err) {
    serverSetupDone = false; // retry next time we come online
    console.warn('[session] server setup failed', err);
  }
}
