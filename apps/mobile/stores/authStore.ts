/**
 * Auth store — uses Supabase Auth directly.
 *
 * No custom token storage, no refresh interceptor, no session rotation logic.
 * Supabase's SDK handles all of that internally, persisting tokens in
 * expo-secure-store via the adapter in lib/supabase.ts.
 *
 * The store holds the application user identity (role, name, student/mentor IDs)
 * which comes from our backend's GET /api/auth/me after Supabase validates the JWT.
 */

import { create } from 'zustand';
import type { AuthenticatedUser } from '@ims/shared-types';
import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api/client';
import { clearLocalData } from '@/lib/db/database';
import { registerForPushNotifications, unregisterPushToken } from '@/lib/notifications/register';

interface AuthState {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  isSigningIn: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  isSigningIn: false,
  error: null,

  /**
   * Launch-time session restore.
   *
   * Supabase SDK loads the persisted session from secure store automatically.
   * We just need to check if a session exists and fetch the user identity.
   */
  async bootstrap() {
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        set({ isBootstrapping: false, isAuthenticated: false, user: null });
        return;
      }

      // Session exists — try to fetch app identity, but don't block on failure
      try {
        const user = await api.get<AuthenticatedUser>('/auth/me');
        set({ user, isAuthenticated: true, isBootstrapping: false });
      } catch {
        // Backend unreachable but we have a valid Supabase session.
        // Show as authenticated with minimal info so the app renders.
        set({
          user: {
            id: session.user.id,
            email: session.user.email ?? '',
            role: (session.user.user_metadata?.role as string ?? 'student') as AuthenticatedUser['role'],
            name: session.user.user_metadata?.name as string ?? session.user.email?.split('@')[0] ?? 'User',
          },
          isAuthenticated: true,
          isBootstrapping: false,
        });
      }
    } catch {
      // No session at all — go to login
      set({ user: null, isAuthenticated: false, isBootstrapping: false });
    }
  },

  async login(email, password) {
    set({ isSigningIn: true, error: null });
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        throw new Error(error?.message ?? 'Email or password is incorrect.');
      }

      // Fetch the app user identity (role, student/mentor profile)
      const user = await api.get<AuthenticatedUser>('/auth/me');
      set({ user, isAuthenticated: true, isSigningIn: false });

      // Register push token in the background
      void registerForPushNotifications();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign in.';
      set({ isSigningIn: false, error: message });
      throw error;
    }
  },

  async logout() {
    try {
      await unregisterPushToken();
    } catch {
      // Best effort
    }

    const supabase = getSupabase();
    await supabase.auth.signOut();

    // Clear local offline data — the next user must not see the previous one's drafts
    await clearLocalData();

    set({ user: null, isAuthenticated: false, error: null });
  },

  async refreshUser() {
    if (!get().isAuthenticated) return;
    try {
      const user = await api.get<AuthenticatedUser>('/auth/me');
      set({ user });
    } catch {
      // Leave cached identity; the SDK will handle session expiry
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Listen for Supabase auth state changes — deferred to next tick so module
 * loading completes even if getSupabase() has issues.
 */
setTimeout(() => {
  try {
    getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ user: null, isAuthenticated: false });
      }
    });
  } catch {
    // Supabase not ready yet — the bootstrap flow handles this
  }
}, 0);
