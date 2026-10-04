/**
 * WebSocketService.ts
 * Real-time WebSocket connection manager for BartaSetu mobile.
 * Connects to /ws/{userId} with auto-reconnection (exponential backoff),
 * ping/pong heartbeats, and typed listeners for UI stores.
 */

import { apiService } from './ApiService';
import {
  DeliveryAckWsEvent,
  MessageResponse,
  NewMessageWsEvent,
  SOSAlertWsEvent,
  SOSResponse,
  WebSocketEventType,
  WebSocketListener,
  WebSocketMessage
} from '../types';

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private socket: WebSocket | null = null;
  private currentUserId: string | null = null;
  private customWsUrl: string | null = null;

  // Reconnection configuration
  private isExplicitlyClosed = false;
  private reconnectAttempt = 0;
  private readonly initialReconnectDelay = 1000; // 1s
  private readonly maxReconnectDelay = 30000; // 30s
  private reconnectTimeoutId: any = null;

  // Heartbeat configuration
  private pingIntervalId: any = null;
  private readonly pingIntervalMs = 25000; // 25s
  private pongTimeoutId: any = null;
  private readonly pongTimeoutMs = 10000; // 10s timeout after ping

  // Event Listeners
  private eventListeners: Map<string, Set<WebSocketListener>> = new Map();
  private connectionListeners: Set<(connected: boolean, state: ConnectionState) => void> = new Set();
  private state: ConnectionState = 'DISCONNECTED';

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  // ==========================================================================
  // Connection Lifecycle
  // ==========================================================================

  /**
   * Set custom WebSocket URL endpoint if needed
   */
  public setCustomWsUrl(url: string | null): void {
    this.customWsUrl = url;
  }

  /**
   * Connect to /ws/{userId} for real-time messaging
   */
  public connect(userId: string): void {
    if (!userId) {
      console.warn('WebSocketService: connect called without valid userId');
      return;
    }

    if (this.socket && this.currentUserId === userId && this.state === 'CONNECTED') {
      return; // Already actively connected
    }

    this.currentUserId = userId;
    this.isExplicitlyClosed = false;
    this.initiateConnection();
  }

  private getWebSocketUrl(): string {
    if (this.customWsUrl) {
      return this.customWsUrl;
    }
    const apiBase = apiService.getBaseUrl();
    const wsBase = apiBase.replace(/^http/, 'ws');
    return `${wsBase}/ws/${this.currentUserId}`;
  }

  private initiateConnection(): void {
    this.cleanupSocket();

    const url = this.getWebSocketUrl();
    this.setState(this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
    } catch (err) {
      console.error('WebSocket connection initialization error:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect the WebSocket and abort auto-reconnects
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.clearReconnectTimeout();
    this.clearHeartbeat();
    this.cleanupSocket();
    this.setState('DISCONNECTED');
  }

  private cleanupSocket(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }

  // ==========================================================================
  // WebSocket Event Handlers
  // ==========================================================================

  private handleOpen(): void {
    this.reconnectAttempt = 0;
    this.setState('CONNECTED');
    this.startHeartbeat();
  }

  private handleMessage(event: WebSocketMessageEvent): void {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);
      if (!data || !data.type) return;

      if (data.type === 'pong') {
        this.handlePong();
        return;
      }

      this.dispatchEvent(data.type, data);

      // Specific convenient dispatchers
      if (data.type === 'new_message') {
        const msgEvent = data as NewMessageWsEvent;
        this.dispatchEvent('message', msgEvent.message);
      } else if (data.type === 'delivery_ack') {
        const ackEvent = data as DeliveryAckWsEvent;
        this.dispatchEvent('ack', { message_id: ackEvent.message_id, status: ackEvent.status });
      } else if (data.type === 'sos_alert') {
        const sosEvent = data as SOSAlertWsEvent;
        this.dispatchEvent('sos', sosEvent.alert);
      }
    } catch (err) {
      console.error('Failed to parse incoming WebSocket message:', err, event.data);
    }
  }

  private handleError(error: any): void {
    console.warn('WebSocket error encountered:', error);
  }

  private handleClose(): void {
    this.clearHeartbeat();
    this.setState('DISCONNECTED');

    if (!this.isExplicitlyClosed) {
      this.scheduleReconnect();
    }
  }

  // ==========================================================================
  // Heartbeat (Ping / Pong)
  // ==========================================================================

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.pingIntervalId = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
  }

  private sendPing(): void {
    if (this.state !== 'CONNECTED' || !this.socket) return;

    this.send({ type: 'ping' });

    // Expect pong within timeout, otherwise reconnect
    this.pongTimeoutId = setTimeout(() => {
      console.warn('WebSocket heartbeat timeout: no pong received. Reconnecting...');
      this.cleanupSocket();
      this.scheduleReconnect();
    }, this.pongTimeoutMs);
  }

  private handlePong(): void {
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId);
      this.pongTimeoutId = null;
    }
    this.dispatchEvent('pong', { type: 'pong' });
  }

  private clearHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId);
      this.pongTimeoutId = null;
    }
  }

  // ==========================================================================
  // Auto-Reconnection (Exponential Backoff)
  // ==========================================================================

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed || !this.currentUserId) return;

    this.clearReconnectTimeout();
    this.setState('RECONNECTING');

    // Calculate delay with exponential backoff & jitter
    const exponential = Math.min(
      this.initialReconnectDelay * Math.pow(1.8, this.reconnectAttempt),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 500;
    const delay = Math.round(exponential + jitter);

    this.reconnectAttempt++;

    this.reconnectTimeoutId = setTimeout(() => {
      this.initiateConnection();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  // ==========================================================================
  // State & Listener Management
  // ==========================================================================

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    const isConn = newState === 'CONNECTED';
    this.connectionListeners.forEach((listener) => {
      try {
        listener(isConn, newState);
      } catch (err) {
        console.error('Error in connection listener:', err);
      }
    });
  }

  public isConnected(): boolean {
    return this.state === 'CONNECTED' && this.socket?.readyState === WebSocket.OPEN;
  }

  public getConnectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Send JSON message over the WebSocket
   */
  public send(payload: any): boolean {
    if (this.isConnected() && this.socket) {
      try {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        this.socket.send(text);
        return true;
      } catch (e) {
        console.error('WebSocket send error:', e);
        return false;
      }
    }
    return false;
  }

  /**
   * Register a listener for any specific WebSocket event type
   */
  public addListener<T = any>(eventType: string, listener: WebSocketListener<T>): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);

    return () => {
      this.removeListener(eventType, listener);
    };
  }

  public removeListener(eventType: string, listener: WebSocketListener): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    }
  }

  private dispatchEvent(eventType: string, data: any): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (e) {
          console.error(`Error in WebSocket listener for ${eventType}:`, e);
        }
      });
    }
  }

  /**
   * Convenience listener for incoming messages (new_message)
   */
  public onNewMessage(callback: (message: MessageResponse) => void): () => void {
    const handler = (eventData: any) => {
      if (eventData?.message) callback(eventData.message);
      else if (eventData?.id) callback(eventData);
    };
    return this.addListener('new_message', handler);
  }

  /**
   * Convenience listener for delivery acknowledgments
   */
  public onDeliveryAck(callback: (ack: { message_id: string; status: string }) => void): () => void {
    return this.addListener('delivery_ack', callback);
  }

  /**
   * Convenience listener for SOS alerts
   */
  public onSOSAlert(callback: (alert: SOSResponse) => void): () => void {
    const handler = (eventData: any) => {
      if (eventData?.alert) callback(eventData.alert);
      else if (eventData?.id) callback(eventData);
    };
    return this.addListener('sos_alert', handler);
  }

  /**
   * Listener for connection status transitions
   */
  public onConnectionChange(callback: (connected: boolean, state: ConnectionState) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.isConnected(), this.state);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }
}

export const webSocketService = WebSocketService.getInstance();
