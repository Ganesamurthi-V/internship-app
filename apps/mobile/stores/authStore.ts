/**
 * Auth store — 12_Mobile_App_Spec §4.
 *
 * Holds the authenticated identity and drives the routing decision in 06_App_Flow §2
 * (token valid? -> role check -> role dashboard; otherwise login).
 *
 * The tokens themselves live in `expo-secure-store` and in the API client's module
 * state. This store deliberately does not persist them: 07_Security_and_Privacy §3.1
 * forbids keeping tokens in a store "without secure-store backing".
 */

import { create } from 'zustand';
import type { AuthenticatedUser } from '@ims/shared-types';
import {
  api,
  clearSession,
  login as apiLogin,
  restoreSession,
  setSessionExpiredHandler,
} from '@/lib/api/client';
import { tokenStore } from '@/lib/auth/tokenStore';
import { clearLocalData } from '@/lib/db/database';
import { registerForPushNotifications, unregisterPushToken } from '@/lib/notifications/register';

interface AuthState {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  /** True until the launch-time session restore finishes, so routing can wait. */
  isBootstrapping: boolean;
  isSigningIn: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

/**
 * Note the curried `create<T>()(...)` form. Zustand v5 requires it when the state type
 * is supplied explicitly; the single-call `create<T>(fn)` form leaves selector
 * parameters implicitly `any`, which silently defeats type checking at every call site.
 */
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  isSigningIn: false,
  error: null,

  /**
   * Launch-time restore.
   *
   * A stored refresh token is not proof of a live session — it may have been revoked —
   * so `GET /api/auth/me` is the actual test. If it fails, the user is sent to login.
   */
  async bootstrap() {
    try {
      const restored = await restoreSession();
      if (!restored) {
        set({ isBootstrapping: false, isAuthenticated: false, user: null });
        return;
      }

      const user = await api.get<AuthenticatedUser>('/auth/me');
      set({ user, isAuthenticated: true, isBootstrapping: false });
    } catch {
      // Offline at launch with a stored token is indistinguishable here from a revoked
      // token. Treating it as signed out is the safe choice; the student signs in again
      // once there is a connection.
      await tokenStore.clear();
      clearSession();
      set({ user: null, isAuthenticated: false, isBootstrapping: false });
    }
  },

  async login(email, password) {
    set({ isSigningIn: true, error: null });
    try {
      const result = await apiLogin(email, password);
      set({ user: result.user, isAuthenticated: true, isSigningIn: false });

      // 06_App_Flow §2: register the push token immediately after a successful login.
      // Failure is swallowed — a student without notifications can still use the app.
      void registerForPushNotifications();
    } catch (error) {
      set({
        isSigningIn: false,
        error: error instanceof Error ? error.message : 'Could not sign in.',
      });
      throw error;
    }
  },

  /**
   * Signs out and leaves no trace of the previous user on the device.
   *
   * Order matters: the push token is unregistered and the session revoked while the
   * access token is still valid, then local state is cleared. Every step is
   * independently guarded so a network failure still results in a local sign-out.
   */
  async logout() {
    try {
      await unregisterPushToken();
    } catch {
      // The device token is also pruned server-side on the next failed delivery.
    }

    try {
      const stored = await tokenStore.load();
      await api.post('/auth/logout', { refreshToken: stored?.refreshToken });
    } catch {
      // Offline logout is still a logout locally.
    }

    await tokenStore.clear();
    clearSession();

    // Drafts belong to the signed-in student; the next user must not see them.
    await clearLocalData();

    set({ user: null, isAuthenticated: false, error: null });
  },

  async refreshUser() {
    if (!get().isAuthenticated) return;
    try {
      const user = await api.get<AuthenticatedUser>('/auth/me');
      set({ user });
    } catch {
      // Leave the cached identity in place; the interceptor handles a dead session.
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Wires the API client's "refresh token rejected" callback into the store, so a
 * server-side revocation drops the user to the login screen without any screen
 * needing to handle it.
 */
setSessionExpiredHandler(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
