/**
 * WebSocket connection to the backend for instant delivery while online.
 * Auth: /ws?token=<access JWT>&device_id=<id>. Reconnects with backoff.
 */

import { WS_URL } from '../config';
import { api } from './api';
import { ServerMessage } from '../types';

type Handlers = {
  onMessage: (msg: ServerMessage) => void;
  onAck: (messageId: string, status: string) => void;
  onSos: (alert: any) => void;
  onConnected: () => void;
  onDisconnected: () => void;
};

class Realtime {
  private ws: WebSocket | null = null;
  private handlers: Handlers | null = null;
  private deviceId: string | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  connected = false;

  start(handlers: Handlers, deviceId: string | null) {
    this.handlers = handlers;
    this.deviceId = deviceId;
    this.wanted = true;
    this.open();
  }

  stop() {
    this.wanted = false;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setConnected(false);
  }

  /** Called when the network comes back so we do not wait for the backoff timer. */
  reconnectNow() {
    if (!this.wanted || this.connected) return;
    this.retry = 0;
    this.clearTimers();
    this.open();
  }

  private open() {
    const token = api.getAccessToken();
    if (!this.wanted || !token) return;
    this.ws?.close();

    const params = `token=${encodeURIComponent(token)}${this.deviceId ? `&device_id=${encodeURIComponent(this.deviceId)}` : ''}`;
    const ws = new WebSocket(`${WS_URL}/ws?${params}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 25_000);
    };

    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      switch (data.type) {
        case 'connected':
          this.setConnected(true);
          break;
        case 'new_message':
          this.handlers?.onMessage(data.message);
          break;
        case 'delivery_ack':
          this.handlers?.onAck(data.message_id, data.status);
          break;
        case 'sos_alert':
          this.handlers?.onSos(data.alert);
          break;
      }
    };

    ws.onclose = async (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.setConnected(false);
      if (!this.wanted) return;
      // 1008 = token rejected; refresh before retrying
      if (event.code === 1008) await api.refreshTokens();
      const delay = Math.min(30_000, 1_000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };

    ws.onerror = () => {
      // onclose follows and schedules the retry
    };
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    if (value) this.handlers?.onConnected();
    else this.handlers?.onDisconnected();
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }
}

export const realtime = new Realtime();
