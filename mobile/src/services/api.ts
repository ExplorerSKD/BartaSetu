/**
 * REST client for the BartaSetu FastAPI backend, with JWT injection and automatic token refresh.
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config';
import { appEvents } from '../lib/events';
import { AuthResponse, MsgPacket, PublicUser, ServerMessage, User } from '../types';

export interface Tokens {
  access: string;
  refresh: string;
}

type TokenListener = (tokens: Tokens | null) => void;

class ApiClient {
  private http: AxiosInstance;
  private tokens: Tokens | null = null;
  private refreshing: Promise<Tokens | null> | null = null;
  private tokenListener: TokenListener | null = null;

  constructor() {
    this.http = axios.create({ baseURL: API_URL, timeout: 12000 });

    this.http.interceptors.request.use((config) => {
      if (this.tokens && config.headers) {
        config.headers.Authorization = `Bearer ${this.tokens.access}`;
      }
      return config;
    });

    this.http.interceptors.response.use(undefined, async (error: AxiosError) => {
      const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
      const isAuthCall = original?.url?.startsWith('/api/auth/');
      if (error.response?.status === 401 && original && !original._retry && !isAuthCall && this.tokens) {
        original._retry = true;
        const fresh = await this.refreshTokens();
        if (fresh) {
          original.headers.Authorization = `Bearer ${fresh.access}`;
          return this.http(original);
        }
        // Tokens are only cleared when the server rejected the refresh token
        if (!this.tokens) appEvents.emit('sessionExpired');
      }
      throw error;
    });
  }

  setTokens(tokens: Tokens | null) {
    this.tokens = tokens;
  }

  getAccessToken(): string | null {
    return this.tokens?.access ?? null;
  }

  onTokensChanged(listener: TokenListener) {
    this.tokenListener = listener;
  }

  /** Single-flight refresh shared by every request that hit a 401. */
  async refreshTokens(): Promise<Tokens | null> {
    if (!this.tokens) return null;
    if (!this.refreshing) {
      const refreshToken = this.tokens.refresh;
      this.refreshing = this.http
        .post<AuthResponse>('/api/auth/refresh', { refresh_token: refreshToken })
        .then((res) => {
          const next = { access: res.data.access_token, refresh: res.data.refresh_token };
          this.tokens = next;
          this.tokenListener?.(next);
          return next;
        })
        .catch((err: AxiosError) => {
          // Only a rejected refresh token ends the session; network errors keep it for offline use
          if (err.response?.status === 401) {
            this.tokens = null;
            this.tokenListener?.(null);
          }
          return null;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  // ---------------------------------------------------------------- auth
  async register(data: { username: string; email: string; password: string; display_name?: string }) {
    return (await this.http.post<AuthResponse>('/api/auth/register', data)).data;
  }

  async login(username: string, password: string) {
    return (await this.http.post<AuthResponse>('/api/auth/login', { username, password })).data;
  }

  async me() {
    return (await this.http.get<User>('/api/users/me')).data;
  }

  // ---------------------------------------------------------------- users
  async lookupByBsId(bsId: string) {
    return (await this.http.get<PublicUser>(`/api/users/lookup/${encodeURIComponent(bsId)}`)).data;
  }

  async searchUsers(q: string) {
    return (await this.http.get<PublicUser[]>('/api/users/search', { params: { q } })).data;
  }

  async getUser(userId: string) {
    return (await this.http.get<PublicUser>(`/api/users/${userId}`)).data;
  }

  async uploadPublicKey(publicKey: string) {
    await this.http.post('/api/users/public-key', { public_key: publicKey, key_type: 'x25519' });
  }

  // ---------------------------------------------------------------- devices
  async registerDevice(data: { id?: string | null; device_name: string; latitude?: number | null; longitude?: number | null }) {
    return (await this.http.post<{ id: string }>('/api/devices/register', { ...data, platform: 'android' })).data;
  }

  // ---------------------------------------------------------------- messages
  /** Direct upload of our own message. Resolves true if stored (or already stored). */
  async sendMessage(packet: MsgPacket): Promise<boolean> {
    try {
      await this.http.post('/api/messages', toServerPayload(packet));
      return true;
    } catch (err) {
      if ((err as AxiosError).response?.status === 409) return true;
      throw err;
    }
  }

  /** Gateway upload of messages carried through the mesh (original sender preserved). */
  async syncRelayed(packets: MsgPacket[], gatewayUserId: string) {
    const body = { messages: packets.map((p) => ({ ...toServerPayload(p), sender_id: p.sender_id, gateway_device_id: gatewayUserId })) };
    return (await this.http.post<ServerMessage[]>('/api/messages/sync', body)).data;
  }

  async inbox() {
    return (await this.http.get<ServerMessage[]>('/api/messages/inbox')).data;
  }

  async statuses(ids: string[]) {
    if (ids.length === 0) return [];
    return (await this.http.get<Array<{ id: string; status: string }>>('/api/messages/status', { params: { ids: ids.join(',') } })).data;
  }

  async ack(messageId: string, status = 'DELIVERED') {
    await this.http.post(`/api/messages/${messageId}/ack`, { message_id: messageId, status });
  }

  async syncAcks(acks: Array<{ message_id: string; recipient_id: string; status: string }>) {
    return (await this.http.post<{ applied: string[] }>('/api/messages/acks', { acks })).data;
  }

  // ---------------------------------------------------------------- SOS
  async createSos(data: { id: string; device_id?: string | null; message: string; latitude: number | null; longitude: number | null; battery_level?: number | null }) {
    return (await this.http.post('/api/sos', data)).data;
  }

  async syncSos(alerts: Array<{ id: string; user_id: string; message: string; latitude: number | null; longitude: number | null; battery_level?: number | null }>) {
    return (await this.http.post('/api/sos/sync', { alerts })).data;
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.http.get('/health', { timeout: 5000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}

function toServerPayload(p: MsgPacket) {
  return {
    id: p.id,
    recipient_id: p.recipient_id,
    encrypted_content: p.encrypted_content,
    content_type: 'text',
    priority: p.priority,
    hop_count: p.hop_count,
    max_hops: p.max_hops,
    ttl: p.ttl,
    expires_at: p.expires_at,
    created_at: p.created_at,
    route: p.route.map((h) => ({ device_id: h.node, hop_number: h.hop, action: h.action })),
  };
}

/** Human-readable error for alerts and form banners. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as AxiosError<{ detail?: unknown }>;
  if (e?.response?.data?.detail) {
    const detail = e.response.data.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '');
  }
  if (e?.code === 'ECONNABORTED' || e?.message === 'Network Error') {
    return 'Cannot reach the BartaSetu server. Check your internet connection.';
  }
  return fallback;
}

export const api = new ApiClient();
