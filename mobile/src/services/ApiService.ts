/**
 * ApiService.ts
 * REST API client for BartaSetu mobile application.
 * Built with Axios, supporting configurable base URLs (Android emulator 10.0.2.2 vs physical device IP),
 * automatic JWT Bearer token injection, and response interceptor for token refresh.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import {
  AuthTokens,
  DeviceRegister,
  DeviceResponse,
  MessageAckResponse,
  MessageCreate,
  MessageResponse,
  PublicKeyInfo,
  SOSCreate,
  SOSResponse,
  UserCreate,
  UserListResponse,
  UserLogin,
  UserResponse
} from '../types';

export const getDefaultApiBaseUrl = (): string => {
  // If running in web browser, connect directly to localhost / host machine
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : (window.location.hostname || 'localhost');
    return `http://${hostname}:8000`;
  }
  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }
  // Android emulator maps host machine to 10.0.2.2
  return 'http://10.0.2.2:8000';
};

export const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();

export class ApiService {
  private static instance: ApiService | null = null;
  private client: AxiosInstance;
  private baseUrl: string = DEFAULT_API_BASE_URL;
  private accessToken: string | null = null;
  private refreshTokenVal: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  private constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    this.setupInterceptors();
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Configure Axios request and response interceptors
   */
  private setupInterceptors(): void {
    // Request Interceptor: Attach JWT Bearer token automatically
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response Interceptor: Handle 401s and attempt automatic token refresh
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) return Promise.reject(error);

        // Avoid infinite refresh loops for auth endpoints
        const isAuthEndpoint =
          originalRequest.url?.includes('/api/auth/login') ||
          originalRequest.url?.includes('/api/auth/register') ||
          originalRequest.url?.includes('/api/auth/refresh');

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          if (this.refreshTokenVal) {
            if (this.isRefreshing) {
              // Queue request until refresh completes
              return new Promise((resolve) => {
                this.refreshSubscribers.push((token: string) => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  resolve(this.client(originalRequest));
                });
              });
            }

            originalRequest._retry = true;
            this.isRefreshing = true;

            try {
              const newTokens = await this.refreshToken(this.refreshTokenVal);
              this.setTokens(newTokens.access_token, newTokens.refresh_token);
              this.isRefreshing = false;
              this.notifyRefreshSubscribers(newTokens.access_token);

              originalRequest.headers.Authorization = `Bearer ${newTokens.access_token}`;
              return this.client(originalRequest);
            } catch (refreshErr) {
              this.isRefreshing = false;
              this.clearTokens();
              return Promise.reject(refreshErr);
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private notifyRefreshSubscribers(token: string): void {
    this.refreshSubscribers.forEach((callback) => callback(token));
    this.refreshSubscribers = [];
  }

  // ==========================================================================
  // Configuration & Token Management
  // ==========================================================================

  public setBaseUrl(url: string): void {
    // Strip trailing slashes for consistency
    this.baseUrl = url.replace(/\/+$/, '');
    this.client.defaults.baseURL = this.baseUrl;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setTokens(accessToken: string | null, refreshToken: string | null = null): void {
    this.accessToken = accessToken;
    if (refreshToken !== null) {
      this.refreshTokenVal = refreshToken;
    }
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public getRefreshToken(): string | null {
    return this.refreshTokenVal;
  }

  public clearTokens(): void {
    this.accessToken = null;
    this.refreshTokenVal = null;
  }

  // ==========================================================================
  // Authentication Endpoints
  // ==========================================================================

  /**
   * Register a new user account
   */
  public async register(user: UserCreate): Promise<AuthTokens> {
    const response = await this.client.post<AuthTokens>('/api/auth/register', user);
    if (response.data?.access_token) {
      this.setTokens(response.data.access_token, response.data.refresh_token);
    }
    return response.data;
  }

  /**
   * Log in with username and password
   */
  public async login(username: string, password: string): Promise<AuthTokens> {
    const payload: UserLogin = { username, password };
    const response = await this.client.post<AuthTokens>('/api/auth/login', payload);
    if (response.data?.access_token) {
      this.setTokens(response.data.access_token, response.data.refresh_token);
    }
    return response.data;
  }

  /**
   * Refresh JWT access token using refresh token
   */
  public async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await this.client.post<AuthTokens>('/api/auth/refresh', {
      refresh_token: refreshToken
    });
    return response.data;
  }

  // ==========================================================================
  // User Management Endpoints
  // ==========================================================================

  /**
   * Fetch paginated list of active users
   */
  public async getUsers(skip: number = 0, limit: number = 50): Promise<UserListResponse> {
    const response = await this.client.get<UserListResponse>('/api/users', {
      params: { skip, limit }
    });
    return response.data;
  }

  /**
   * Get specific user profile by user ID
   */
  public async getUser(id: string): Promise<UserResponse> {
    const response = await this.client.get<UserResponse>(`/api/users/${id}`);
    return response.data;
  }

  /**
   * Upload user public encryption key (x25519/ECDH)
   */
  public async uploadPublicKey(publicKey: string, keyType: string = 'x25519'): Promise<PublicKeyInfo> {
    const response = await this.client.post<PublicKeyInfo>('/api/users/public-key', {
      public_key: publicKey,
      key_type: keyType
    });
    return response.data;
  }

  /**
   * Retrieve public key of target user
   */
  public async getUserPublicKey(userId: string): Promise<PublicKeyInfo> {
    const response = await this.client.get<PublicKeyInfo>(`/api/users/${userId}/public-key`);
    return response.data;
  }

  // ==========================================================================
  // Device Endpoints
  // ==========================================================================

  /**
   * Register or update physical device with FCM token and platform details
   */
  public async registerDevice(device: DeviceRegister): Promise<DeviceResponse> {
    const response = await this.client.post<DeviceResponse>('/api/devices/register', device);
    return response.data;
  }

  /**
   * List all devices registered under the current authenticated user
   */
  public async getDevices(): Promise<DeviceResponse[]> {
    const response = await this.client.get<DeviceResponse[]>('/api/devices');
    return response.data;
  }

  // ==========================================================================
  // Message Endpoints
  // ==========================================================================

  /**
   * Send a single message to backend server
   */
  public async sendMessage(message: MessageCreate): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>('/api/messages', message);
    return response.data;
  }

  /**
   * Retrieve messages for current user (sent or received)
   */
  public async getMessages(statusFilter?: string, skip: number = 0, limit: number = 50): Promise<MessageResponse[]> {
    const params: any = { skip, limit };
    if (statusFilter) {
      params.status_filter = statusFilter;
    }
    const response = await this.client.get<MessageResponse[]>('/api/messages', { params });
    return response.data;
  }

  /**
   * Retrieve specific message details
   */
  public async getMessage(messageId: string): Promise<MessageResponse> {
    const response = await this.client.get<MessageResponse>(`/api/messages/${messageId}`);
    return response.data;
  }

  /**
   * Sync a batch of messages buffered offline to FastAPI backend
   */
  public async syncMessages(messages: MessageCreate[]): Promise<MessageResponse[]> {
    const response = await this.client.post<MessageResponse[]>('/api/messages/sync', {
      messages
    });
    return response.data;
  }

  /**
   * Send delivery or read acknowledgment for a message
   */
  public async acknowledgeMessage(
    messageId: string,
    status: 'DELIVERED' | 'READ' | string = 'DELIVERED'
  ): Promise<MessageAckResponse> {
    const response = await this.client.post<MessageAckResponse>(`/api/messages/${messageId}/ack`, {
      message_id: messageId,
      status
    });
    return response.data;
  }

  // ==========================================================================
  // SOS & Emergency Endpoints
  // ==========================================================================

  /**
   * Create and broadcast an emergency SOS alert
   */
  public async createSOS(sosData: SOSCreate): Promise<SOSResponse> {
    const response = await this.client.post<SOSResponse>('/api/sos', sosData);
    return response.data;
  }

  /**
   * Get all emergency SOS alerts
   */
  public async getSOSAlerts(statusFilter?: string): Promise<SOSResponse[]> {
    const params: any = {};
    if (statusFilter) {
      params.status_filter = statusFilter;
    }
    const response = await this.client.get<SOSResponse[]>('/api/sos', { params });
    return response.data;
  }

  /**
   * Get specific SOS alert by ID
   */
  public async getSOSAlert(sosId: string): Promise<SOSResponse> {
    const response = await this.client.get<SOSResponse>(`/api/sos/${sosId}`);
    return response.data;
  }
}

export const apiService = ApiService.getInstance();
