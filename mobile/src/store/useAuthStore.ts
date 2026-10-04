/**
 * useAuthStore.ts
 * Zustand state store for User Authentication in BartaSetu mobile.
 * Manages user credentials, JWT tokens, session restoration,
 * and links authenticated session to ApiService and WebSocketService.
 */

import { create } from 'zustand';
import { apiService } from '../services/ApiService';
import { webSocketService } from '../services/WebSocketService';
import { messageService } from '../services/MessageService';
import { AuthTokens, User, UserCreate, UserLogin } from '../types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: UserLogin) => Promise<boolean>;
  register: (userData: UserCreate) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  setUser: (user: User | null) => void;
  clearError: () => void;
}

const STORAGE_KEYS = {
  TOKENS: 'bartasetu_auth_tokens',
  USER: 'bartasetu_auth_user'
};

// Safe storage helper with fallback
async function getStorageItem(key: string): Promise<string | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setStorageItem(key: string, value: string): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(key, value);
  } catch {}
}

async function removeStorageItem(key: string): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(key);
  } catch {}
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials: UserLogin) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await apiService.login(credentials.username, credentials.password);
      apiService.setTokens(tokens.access_token, tokens.refresh_token);

      // Construct user profile
      let user: User;
      try {
        const usersList = await apiService.getUsers(0, 100);
        const matched = usersList.users.find((u) => u.username === credentials.username);
        if (matched) {
          user = matched;
        } else {
          user = {
            id: `usr_${credentials.username}`,
            username: credentials.username,
            email: `${credentials.username}@bartasetu.local`,
            display_name: credentials.username,
            is_active: true
          };
        }
      } catch {
        user = {
          id: `usr_${credentials.username}`,
          username: credentials.username,
          email: `${credentials.username}@bartasetu.local`,
          display_name: credentials.username,
          is_active: true
        };
      }

      // Persist session
      await setStorageItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
      await setStorageItem(STORAGE_KEYS.USER, JSON.stringify(user));

      // Connect services
      messageService.setCurrentUserId(user.id);
      webSocketService.connect(user.id);

      set({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });

      return true;
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail || err?.message || 'Login failed. Please check your credentials.';
      set({ isLoading: false, error: errorMsg });
      return false;
    }
  },

  register: async (userData: UserCreate) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await apiService.register(userData);
      apiService.setTokens(tokens.access_token, tokens.refresh_token);

      const user: User = {
        id: `usr_${userData.username}`,
        username: userData.username,
        email: userData.email,
        display_name: userData.display_name || userData.username,
        is_active: true
      };

      await setStorageItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
      await setStorageItem(STORAGE_KEYS.USER, JSON.stringify(user));

      messageService.setCurrentUserId(user.id);
      webSocketService.connect(user.id);

      set({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });

      return true;
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail || err?.message || 'Registration failed. Please try again.';
      set({ isLoading: false, error: errorMsg });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      apiService.clearTokens();
      webSocketService.disconnect();
      messageService.setCurrentUserId(null);

      await removeStorageItem(STORAGE_KEYS.TOKENS);
      await removeStorageItem(STORAGE_KEYS.USER);
    } catch (e) {
      console.warn('Error during logout cleanup:', e);
    } finally {
      set({
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    }
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const tokensStr = await getStorageItem(STORAGE_KEYS.TOKENS);
      const userStr = await getStorageItem(STORAGE_KEYS.USER);

      if (tokensStr && userStr) {
        const tokens: AuthTokens = JSON.parse(tokensStr);
        const user: User = JSON.parse(userStr);

        apiService.setTokens(tokens.access_token, tokens.refresh_token);
        messageService.setCurrentUserId(user.id);
        webSocketService.connect(user.id);

        set({
          user,
          tokens,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        return true;
      }
    } catch (err) {
      console.warn('Session restoration failed:', err);
    }

    set({ isLoading: false });
    return false;
  },

  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },

  clearError: () => {
    set({ error: null });
  }
}));
