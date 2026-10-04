/**
 * NativeBleBridge.ts
 * BartaSetu Mobile Application
 *
 * Production-ready bridge between React Native JavaScript layer and Android Native BLE module.
 * Wraps NativeModules.BleModule and NativeEventEmitter with full type safety, typed listeners,
 * and a robust simulation/fallback layer for emulator, development machines, and unit tests.
 */

import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface BleDevice {
  id: string;               // Unique device address (e.g. MAC address or UUID)
  name: string;             // Advertised device name (e.g. "BartaSetu-Node-A1")
  rssi: number;             // Signal strength in dBm (-100 to -30)
  distanceMeters?: number;  // Estimated distance calculated from RSSI
  hasInternet?: boolean;    // Flag indicating node has gateway capability
  batteryLevel?: number;    // Battery percentage 0-100
  relayScore?: number;      // Routing score 0.0 - 1.0
  lastSeen: number;         // Epoch timestamp (ms)
}

export interface DeviceLostEvent {
  deviceId: string;
  timestamp: number;
}

export interface MessageReceivedEvent {
  message: string;          // Serialized JSON message payload
  sender: string;           // Sender MAC or device address
  rssi?: number;            // Signal strength at reception
  timestamp: number;        // Epoch timestamp (ms)
}

export interface MessageRelayedEvent {
  messageId: string;
  targetDeviceId: string;
  success: boolean;
  hopCount?: number;
  timestamp: number;
}

export interface ConnectionStateChangeEvent {
  deviceId: string;
  state: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  timestamp: number;
}

export interface BleServiceStatus {
  isRunning: boolean;
  isSimulated: boolean;
  scanning: boolean;
  advertising: boolean;
  connectedDevicesCount: number;
  discoveredDevicesCount: number;
}

export type BleEventName =
  | 'onDeviceDiscovered'
  | 'onDeviceLost'
  | 'onMessageReceived'
  | 'onMessageRelayed'
  | 'onConnectionStateChange';

type EventListener<T = any> = (data: T) => void;

// ============================================================================
// Default Simulated Devices for Emulator / Development Mode
// ============================================================================

const DEFAULT_SIMULATED_DEVICES: BleDevice[] = [
  {
    id: 'FC:F5:C4:01:2A:8E',
    name: 'Rahim Phone (Gateway)',
    rssi: -45,
    distanceMeters: 4.5,
    hasInternet: true,
    batteryLevel: 88,
    relayScore: 0.95,
    lastSeen: Date.now(),
  },
  {
    id: 'DC:A6:32:89:1B:4F',
    name: 'Karim Device (Mesh)',
    rssi: -72,
    distanceMeters: 18.2,
    hasInternet: false,
    batteryLevel: 65,
    relayScore: 0.62,
    lastSeen: Date.now(),
  },
  {
    id: 'E4:5F:01:99:C3:02',
    name: 'Tanvir Relay Node',
    rssi: -60,
    distanceMeters: 9.8,
    hasInternet: false,
    batteryLevel: 75,
    relayScore: 0.78,
    lastSeen: Date.now(),
  },
  {
    id: 'A0:B1:C2:D3:E4:F5',
    name: 'Disaster Shelter Relay #4',
    rssi: -52,
    distanceMeters: 6.2,
    hasInternet: true,
    batteryLevel: 98,
    relayScore: 0.98,
    lastSeen: Date.now(),
  },
];

// ============================================================================
// NativeBleBridge Class
// ============================================================================

export class NativeBleBridge {
  private static instance: NativeBleBridge | null = null;

  private nativeModule: any = null;
  private nativeEmitter: NativeEventEmitter | null = null;
  private isSimulatedMode: boolean = false;
  private isServiceRunning: boolean = false;

  // In-memory listener registry (supports both native events and simulation)
  private listeners: Map<BleEventName, Set<EventListener>> = new Map();
  private nativeSubscriptions: Map<BleEventName, EmitterSubscription> = new Map();

  // Simulated state
  private simulatedDevices: Map<string, BleDevice> = new Map();
  private simulationInterval: any = null;

  constructor(forceSimulation: boolean = false) {
    this.initEventListenersMap();

    const BleModule = NativeModules.BleModule;

    if (forceSimulation || !BleModule || Platform.OS !== 'android') {
      this.isSimulatedMode = true;
      console.log('[NativeBleBridge] Initialized in SIMULATION / FALLBACK mode (No native hardware binding)');
      this.initSimulationState();
    } else {
      this.nativeModule = BleModule;
      try {
        // NativeEventEmitter attaches to BleModule
        this.nativeEmitter = new NativeEventEmitter(BleModule);
        this.wireNativeEvents();
        console.log('[NativeBleBridge] Successfully linked with NativeModules.BleModule');
      } catch (err) {
        console.warn('[NativeBleBridge] Failed to create NativeEventEmitter, falling back to simulation:', err);
        this.isSimulatedMode = true;
        this.initSimulationState();
      }
    }
  }

  public static getInstance(): NativeBleBridge {
    if (!NativeBleBridge.instance) {
      NativeBleBridge.instance = new NativeBleBridge();
    }
    return NativeBleBridge.instance;
  }

  private initEventListenersMap(): void {
    const events: BleEventName[] = [
      'onDeviceDiscovered',
      'onDeviceLost',
      'onMessageReceived',
      'onMessageRelayed',
      'onConnectionStateChange',
    ];
    events.forEach((ev) => this.listeners.set(ev, new Set()));
  }

  // ==========================================================================
  // Native Event Wiring
  // ==========================================================================

  private wireNativeEvents(): void {
    if (!this.nativeEmitter) return;

    // 1. onMessageReceived
    this.nativeSubscriptions.set(
      'onMessageReceived',
      this.nativeEmitter.addListener('onMessageReceived', (event: any) => {
        const payload: MessageReceivedEvent = {
          message: event?.message || '',
          sender: event?.sender || 'UNKNOWN',
          rssi: event?.rssi !== undefined ? Number(event.rssi) : undefined,
          timestamp: Date.now(),
        };
        this.emitInternal('onMessageReceived', payload);
      })
    );

    // 2. onDeviceDiscovered
    this.nativeSubscriptions.set(
      'onDeviceDiscovered',
      this.nativeEmitter.addListener('onDeviceDiscovered', (event: any) => {
        const device: BleDevice = {
          id: event?.id || event?.address || '',
          name: event?.name || 'Unnamed Peer',
          rssi: Number(event?.rssi ?? -70),
          distanceMeters: event?.distanceMeters ?? this.calculateDistance(Number(event?.rssi ?? -70)),
          hasInternet: Boolean(event?.hasInternet),
          batteryLevel: event?.batteryLevel !== undefined ? Number(event.batteryLevel) : undefined,
          relayScore: event?.relayScore !== undefined ? Number(event.relayScore) : undefined,
          lastSeen: Date.now(),
        };
        this.emitInternal('onDeviceDiscovered', device);
      })
    );

    // 3. onDeviceLost
    this.nativeSubscriptions.set(
      'onDeviceLost',
      this.nativeEmitter.addListener('onDeviceLost', (event: any) => {
        const payload: DeviceLostEvent = {
          deviceId: event?.deviceId || event?.id || '',
          timestamp: Date.now(),
        };
        this.emitInternal('onDeviceLost', payload);
      })
    );

    // 4. onMessageRelayed
    this.nativeSubscriptions.set(
      'onMessageRelayed',
      this.nativeEmitter.addListener('onMessageRelayed', (event: any) => {
        const payload: MessageRelayedEvent = {
          messageId: event?.messageId || '',
          targetDeviceId: event?.targetDeviceId || '',
          success: Boolean(event?.success ?? true),
          hopCount: event?.hopCount ? Number(event.hopCount) : undefined,
          timestamp: Date.now(),
        };
        this.emitInternal('onMessageRelayed', payload);
      })
    );

    // 5. onConnectionStateChange
    this.nativeSubscriptions.set(
      'onConnectionStateChange',
      this.nativeEmitter.addListener('onConnectionStateChange', (event: any) => {
        const payload: ConnectionStateChangeEvent = {
          deviceId: event?.deviceId || '',
          state: event?.state || 'CONNECTED',
          timestamp: Date.now(),
        };
        this.emitInternal('onConnectionStateChange', payload);
      })
    );
  }

  // ==========================================================================
  // Public Native API Wrapper Methods
  // ==========================================================================

  /**
   * Starts the foreground BLE Mesh Service (Advertising, Scanning, GATT Server)
   */
  public async startMeshService(): Promise<boolean> {
    if (this.isServiceRunning) {
      console.log('[NativeBleBridge] Mesh service is already running.');
      return true;
    }

    if (this.isSimulatedMode) {
      console.log('[NativeBleBridge:Simulated] Starting simulated mesh service...');
      this.isServiceRunning = true;
      this.startSimulationLoop();
      return true;
    }

    try {
      if (this.nativeModule && typeof this.nativeModule.startMeshService === 'function') {
        const result = await this.nativeModule.startMeshService();
        this.isServiceRunning = true;
        console.log('[NativeBleBridge] Native mesh service started successfully.');
        return Boolean(result ?? true);
      }
    } catch (err) {
      console.error('[NativeBleBridge] Native startMeshService failed:', err);
      // Fallback to simulation on native crash
      this.isSimulatedMode = true;
      this.isServiceRunning = true;
      this.startSimulationLoop();
      return true;
    }

    return false;
  }

  /**
   * Stops the BLE Mesh foreground service and releases hardware handles
   */
  public async stopMeshService(): Promise<boolean> {
    if (!this.isServiceRunning) {
      return true;
    }

    if (this.isSimulatedMode) {
      console.log('[NativeBleBridge:Simulated] Stopping simulated mesh service...');
      this.isServiceRunning = false;
      this.stopSimulationLoop();
      return true;
    }

    try {
      if (this.nativeModule && typeof this.nativeModule.stopMeshService === 'function') {
        const result = await this.nativeModule.stopMeshService();
        this.isServiceRunning = false;
        console.log('[NativeBleBridge] Native mesh service stopped.');
        return Boolean(result ?? true);
      }
    } catch (err) {
      console.error('[NativeBleBridge] Native stopMeshService failed:', err);
    }

    this.isServiceRunning = false;
    return true;
  }

  /**
   * Retrieves list of active nearby BLE peer devices currently in radio range
   */
  public async getNearbyDevices(): Promise<BleDevice[]> {
    if (this.isSimulatedMode) {
      return Array.from(this.simulatedDevices.values());
    }

    try {
      if (this.nativeModule && typeof this.nativeModule.getNearbyDevices === 'function') {
        const nativeDevices = await this.nativeModule.getNearbyDevices();
        if (Array.isArray(nativeDevices)) {
          return nativeDevices.map((d: any) => ({
            id: d.id || d.address || '',
            name: d.name || 'Unnamed Peer',
            rssi: Number(d.rssi ?? -70),
            distanceMeters: d.distanceMeters ?? this.calculateDistance(Number(d.rssi ?? -70)),
            hasInternet: Boolean(d.hasInternet),
            batteryLevel: d.batteryLevel !== undefined ? Number(d.batteryLevel) : undefined,
            relayScore: d.relayScore !== undefined ? Number(d.relayScore) : undefined,
            lastSeen: d.lastSeen ? Number(d.lastSeen) : Date.now(),
          }));
        }
      }
    } catch (err) {
      console.warn('[NativeBleBridge] Failed to get nearby devices from native module, returning simulated:', err);
    }

    return Array.from(this.simulatedDevices.values());
  }

  /**
   * Transmits a serialized message payload to nearby mesh peers via BLE GATT write/characteristic
   */
  public async sendMessageToMesh(messageJson: string): Promise<boolean> {
    if (!messageJson) {
      throw new Error('[NativeBleBridge] Cannot send empty message to mesh');
    }

    if (this.isSimulatedMode) {
      console.log(`[NativeBleBridge:Simulated] Broadcasting payload to simulated peers (${messageJson.length} bytes)`);
      // Simulate asynchronous transmission delay
      setTimeout(() => {
        try {
          const parsed = JSON.parse(messageJson);
          const target = Array.from(this.simulatedDevices.values())[0]?.id || 'SIMULATED_PEER';
          this.emitInternal('onMessageRelayed', {
            messageId: parsed.id || `msg-${Date.now()}`,
            targetDeviceId: target,
            success: true,
            hopCount: (parsed.hop_count || 0) + 1,
            timestamp: Date.now(),
          });
        } catch {
          // Non-JSON payload
        }
      }, 250);
      return true;
    }

    try {
      if (this.nativeModule && typeof this.nativeModule.sendMessageToMesh === 'function') {
        const result = await this.nativeModule.sendMessageToMesh(messageJson);
        return Boolean(result ?? true);
      }
    } catch (err) {
      console.error('[NativeBleBridge] Failed to transmit message through native BLE:', err);
      throw err;
    }

    return false;
  }

  /**
   * Queries hardware & foreground service status
   */
  public async getServiceStatus(): Promise<BleServiceStatus> {
    if (this.isSimulatedMode) {
      return {
        isRunning: this.isServiceRunning,
        isSimulated: true,
        scanning: this.isServiceRunning,
        advertising: this.isServiceRunning,
        connectedDevicesCount: this.simulatedDevices.size,
        discoveredDevicesCount: this.simulatedDevices.size,
      };
    }

    try {
      if (this.nativeModule && typeof this.nativeModule.getServiceStatus === 'function') {
        const status = await this.nativeModule.getServiceStatus();
        return {
          isRunning: this.isServiceRunning,
          isSimulated: false,
          scanning: Boolean(status?.scanning ?? this.isServiceRunning),
          advertising: Boolean(status?.advertising ?? this.isServiceRunning),
          connectedDevicesCount: Number(status?.connectedDevicesCount ?? 0),
          discoveredDevicesCount: Number(status?.discoveredDevicesCount ?? 0),
        };
      }
    } catch (err) {
      console.warn('[NativeBleBridge] Failed to get native service status:', err);
    }

    return {
      isRunning: this.isServiceRunning,
      isSimulated: false,
      scanning: this.isServiceRunning,
      advertising: this.isServiceRunning,
      connectedDevicesCount: 0,
      discoveredDevicesCount: 0,
    };
  }

  // ==========================================================================
  // Typed Event Subscriptions
  // ==========================================================================

  /**
   * Subscribes to peer device discovery events
   */
  public onDeviceDiscovered(listener: (device: BleDevice) => void): () => void {
    return this.subscribe('onDeviceDiscovered', listener);
  }

  /**
   * Subscribes to peer device lost / timeout events
   */
  public onDeviceLost(listener: (event: DeviceLostEvent) => void): () => void {
    return this.subscribe('onDeviceLost', listener);
  }

  /**
   * Subscribes to incoming mesh message received events
   */
  public onMessageReceived(listener: (event: MessageReceivedEvent) => void): () => void {
    return this.subscribe('onMessageReceived', listener);
  }

  /**
   * Subscribes to message relay confirmation events
   */
  public onMessageRelayed(listener: (event: MessageRelayedEvent) => void): () => void {
    return this.subscribe('onMessageRelayed', listener);
  }

  /**
   * Subscribes to GATT connection state transitions
   */
  public onConnectionStateChange(listener: (event: ConnectionStateChangeEvent) => void): () => void {
    return this.subscribe('onConnectionStateChange', listener);
  }

  /**
   * Generic subscription helper returning an unsubscribe function
   */
  public subscribe<T>(eventName: BleEventName, listener: EventListener<T>): () => void {
    const bucket = this.listeners.get(eventName);
    if (bucket) {
      bucket.add(listener);
    }

    // Return cleanup callback
    return () => {
      bucket?.delete(listener);
    };
  }

  /**
   * Removes all registered listeners for a specific event or all events
   */
  public removeAllListeners(eventName?: BleEventName): void {
    if (eventName) {
      this.listeners.get(eventName)?.clear();
    } else {
      this.listeners.forEach((bucket) => bucket.clear());
    }
  }

  private emitInternal(eventName: BleEventName, payload: any): void {
    const bucket = this.listeners.get(eventName);
    if (bucket) {
      bucket.forEach((listener) => {
        try {
          listener(payload);
        } catch (err) {
          console.error(`[NativeBleBridge] Error executing listener for ${eventName}:`, err);
        }
      });
    }
  }

  // ==========================================================================
  // Simulation & Fallback Layer
  // ==========================================================================

  private initSimulationState(): void {
    this.simulatedDevices.clear();
    DEFAULT_SIMULATED_DEVICES.forEach((d) => {
      this.simulatedDevices.set(d.id, { ...d, lastSeen: Date.now() });
    });
  }

  private startSimulationLoop(): void {
    this.stopSimulationLoop();

    // 1. Initial burst of device discovery events
    setTimeout(() => {
      this.simulatedDevices.forEach((device) => {
        this.emitInternal('onDeviceDiscovered', { ...device, lastSeen: Date.now() });
      });
    }, 400);

    // 2. Periodic loop: fluctuate RSSI and simulate beacon updates
    this.simulationInterval = setInterval(() => {
      if (!this.isServiceRunning) return;

      this.simulatedDevices.forEach((dev) => {
        // Subtle signal jitter (-3 to +3 dBm)
        const jitter = Math.floor(Math.random() * 7) - 3;
        const newRssi = Math.max(-95, Math.min(-35, dev.rssi + jitter));
        const updated: BleDevice = {
          ...dev,
          rssi: newRssi,
          distanceMeters: this.calculateDistance(newRssi),
          lastSeen: Date.now(),
        };
        this.simulatedDevices.set(dev.id, updated);
        this.emitInternal('onDeviceDiscovered', updated);
      });
    }, 12000);
  }

  private stopSimulationLoop(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  /**
   * Programmatically simulate peer discovery (for developer UI testing)
   */
  public simulateDeviceDiscovered(device: Partial<BleDevice>): void {
    const fullDevice: BleDevice = {
      id: device.id || `SIM-${Date.now().toString(16).toUpperCase()}`,
      name: device.name || 'Simulated Peer',
      rssi: device.rssi ?? -65,
      distanceMeters: device.distanceMeters ?? this.calculateDistance(device.rssi ?? -65),
      hasInternet: Boolean(device.hasInternet),
      batteryLevel: device.batteryLevel ?? 75,
      relayScore: device.relayScore ?? 0.7,
      lastSeen: Date.now(),
    };
    this.simulatedDevices.set(fullDevice.id, fullDevice);
    this.emitInternal('onDeviceDiscovered', fullDevice);
  }

  /**
   * Programmatically simulate peer disconnect or loss
   */
  public simulateDeviceLost(deviceId: string): void {
    this.simulatedDevices.delete(deviceId);
    this.emitInternal('onDeviceLost', { deviceId, timestamp: Date.now() });
  }

  /**
   * Programmatically simulate receipt of an inbound mesh packet
   */
  public simulateMessageReceived(messageJson: string, senderId?: string): void {
    const sender = senderId || Array.from(this.simulatedDevices.keys())[0] || 'SIM-PEER-01';
    this.emitInternal('onMessageReceived', {
      message: messageJson,
      sender,
      rssi: -55,
      timestamp: Date.now(),
    });
  }

  /**
   * Programmatically simulate connection state transition
   */
  public simulateConnectionStateChange(
    deviceId: string,
    state: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'
  ): void {
    this.emitInternal('onConnectionStateChange', {
      deviceId,
      state,
      timestamp: Date.now(),
    });
  }

  /**
   * Calculate distance estimate from RSSI using log-distance path loss formula
   */
  private calculateDistance(rssi: number, txPower: number = -59, n: number = 2.0): number {
    if (rssi === 0) return -1.0;
    const ratio = (txPower - rssi) / (10 * n);
    const distance = Math.pow(10, ratio);
    return Math.round(distance * 10) / 10;
  }
}

// Export singleton instance and class
export const nativeBleBridge = NativeBleBridge.getInstance();
export default nativeBleBridge;
