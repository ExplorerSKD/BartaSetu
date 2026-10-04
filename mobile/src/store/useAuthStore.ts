import { create } from 'zustand';
import { api, apiErrorMessage } from '../services/api';
import { session } from '../services/session';
import { appEvents } from '../lib/events';
import { AuthResponse, User } from '../types';
import { useChatStore } from './useChatStore';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  busy: boolean;
  error: string | null;
  /** Set right after registration so the app can show the new BartaSetu ID. */
  justRegistered: boolean;

  restore: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (data: { displayName: string; username: string; email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  acknowledgeWelcome: () => void;
  clearError: () => void;
}

async function begin(res: AuthResponse) {
  const tokens = { access: res.access_token, refresh: res.refresh_token };
  await session.save(res.user, tokens);
  await session.start(res.user, tokens);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  busy: false,
  error: null,
  justRegistered: false,

  restore: async () => {
    const saved = await session.loadSaved();
    if (!saved) {
      set({ status: 'signedOut' });
      return;
    }
    // Works offline: the cached profile and local database are enough to use the mesh
    await session.start(saved.user, saved.tokens);
    set({ status: 'signedIn', user: saved.user });

    // Refresh the profile in the background when the server is reachable
    api.me()
      .then(async (user) => {
        set({ user });
        await session.save(user, saved.tokens);
      })
      .catch(() => undefined);
  },

  login: async (username, password) => {
    set({ busy: true, error: null });
    try {
      const res = await api.login(username.trim(), password);
      await begin(res);
      set({ status: 'signedIn', user: res.user, busy: false });
      return true;
    } catch (err) {
      set({ busy: false, error: apiErrorMessage(err, 'Could not sign in.') });
      return false;
    }
  },

  register: async ({ displayName, username, email, password }) => {
    set({ busy: true, error: null });
    try {
      const res = await api.register({
        username: username.trim().toLowerCase(),
        email: email.trim(),
        password,
        display_name: displayName.trim() || undefined,
      });
      await begin(res);
      set({ status: 'signedIn', user: res.user, busy: false, justRegistered: true });
      return true;
    } catch (err) {
      set({ busy: false, error: apiErrorMessage(err, 'Could not create your account.') });
      return false;
    }
  },

  logout: async () => {
    await session.stop();
    await session.clearSaved();
    useChatStore.setState({ conversations: [], contacts: [], messages: [], activePeerId: null });
    set({ status: 'signedOut', user: null, justRegistered: false, error: null });
  },

  acknowledgeWelcome: () => set({ justRegistered: false }),
  clearError: () => set({ error: null }),
}));

appEvents.on('sessionExpired', () => {
  if (useAuthStore.getState().status === 'signedIn') void useAuthStore.getState().logout();
});
