import { create } from 'zustand';
import { NearbySosAlert, Peer } from '../types';

export type SosDeliveryState = 'sending' | 'server' | 'mesh' | 'waiting' | 'failed';

export interface OwnSos {
  id: string;
  category: string;
  createdAt: number;
  state: SosDeliveryState;
  sharedWith: number;
  hasLocation: boolean;
}

interface MeshState {
  /** Backend reachable over the internet. */
  online: boolean;
  /** WebSocket to the backend is open. */
  serverConnected: boolean;
  /** Native mesh module present in this build. */
  meshSupported: boolean;
  permissionsGranted: boolean;
  nearbyActive: boolean;
  bleActive: boolean;
  bluetoothOn: boolean;
  /** Android allows BartaSetu to keep running in the background (battery optimisation off). */
  backgroundAllowed: boolean;
  peers: Record<string, Peer>;
  /** Our own messages waiting for a route. */
  ownQueued: number;
  /** Packets we are carrying for other people. */
  carrying: number;
  relayedForOthers: number;
  nearbyAlerts: NearbySosAlert[];
  /** SOS from a nearby person waiting to be shown full screen. */
  incomingSos: NearbySosAlert | null;
  lastSos: OwnSos | null;
  /** Recent mesh activity, newest first, shown on the Nearby screen. */
  activity: Array<{ at: number; text: string }>;
  set: (partial: Partial<MeshState>) => void;
  reset: () => void;
}

const initial = {
  online: false,
  serverConnected: false,
  meshSupported: false,
  permissionsGranted: false,
  nearbyActive: false,
  bleActive: false,
  bluetoothOn: true,
  backgroundAllowed: true,
  peers: {} as Record<string, Peer>,
  ownQueued: 0,
  carrying: 0,
  relayedForOthers: 0,
  nearbyAlerts: [] as NearbySosAlert[],
  incomingSos: null as NearbySosAlert | null,
  lastSos: null as OwnSos | null,
  activity: [] as Array<{ at: number; text: string }>,
};

export const useMeshStore = create<MeshState>((set) => ({
  ...initial,
  set: (partial) => set(partial),
  reset: () => set(initial),
}));

/** Phones we can hand a message to right now. */
export function reachablePeers(peers: Record<string, Peer>, now = Date.now()): Peer[] {
  return Object.values(peers).filter((p) => isReachable(p, now));
}

export function isReachable(p: Peer, now = Date.now()): boolean {
  return p.nearbyConnected || (p.bleSeenAt != null && now - p.bleSeenAt < 45_000);
}
