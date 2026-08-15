/**
 * Auth store — the single source of truth for authentication state.
 *
 * Every route guard, the root layout and the launch router all read from here.
 * That matters: an earlier version had the login screen talking to Supabase
 * directly while the group layouts read this store, so the store stayed empty and
 * every guard bounced the user straight back to login in an infinite loop.
 *
 * Supabase owns the tokens; this store owns the *application* identity (role,
 * student/mentor ids) that the guards and dashboards need.
 */

import { create } from 'zustand';
import type { AuthenticatedUser, UserRole } from '@ims/shared-types';
import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api/client';

interface AuthState {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  /** True until the launch-time session check settles, so routing can wait. */
  isBootstrapping: boolean;
  isSigningIn: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserRole>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

/**
 * Builds an identity from the Supabase session alone.
 *
 * Used when the backend is unreachable. The role comes from `user_metadata`, which
 * the seed script sets at account creation. This keeps the app usable offline and
 * during local development when the API server is not running — the alternative
 * (treating a valid session as signed out) is far more confusing.
 */
function identityFromSession(session: {
  user: { id: string; email?: string | undefined; user_metadata?: Record<string, unknown> };
}): AuthenticatedUser {
  const metadata = session.user.user_metadata ?? {};
  const email = session.user.email ?? '';

  return {
    id: session.user.id,
    email,
    role: ((metadata.role as string) ?? 'student') as UserRole,
    name: (metadata.name as string) ?? email.split('@')[0] ?? 'User',
  };
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  isSigningIn: false,
  error: null,

  /**
   * Launch-time restore. Reads the Supabase session, then enriches it from the
   * backend when reachable.
   */
  async bootstrap() {
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        set({ isBootstrapping: false, isAuthenticated: false, user: null });
        return;
      }

      // Enrich from the backend, but a valid session is enough to proceed.
      let user: AuthenticatedUser;
      try {
        user = await api.get<AuthenticatedUser>('/auth/me');
      } catch {
        user = identityFromSession(session);
      }

      set({ user, isAuthenticated: true, isBootstrapping: false });
    } catch {
      set({ user: null, isAuthenticated: false, isBootstrapping: false });
    }
  },

  /**
   * Signs in and populates the store.
   *
   * Returns the resolved role so the caller can navigate without re-reading state
   * that React may not have committed yet.
   */
  async login(email, password) {
    set({ isSigningIn: true, error: null });

    try {
      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('Signed in but no session was returned.');

      // Backend enrichment is best-effort — never block sign-in on it.
      let user: AuthenticatedUser;
      try {
        user = await api.get<AuthenticatedUser>('/auth/me');
      } catch {
        user = identityFromSession(data.session);
      }

      set({ user, isAuthenticated: true, isSigningIn: false, error: null });

      return user.role;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign in.';
      set({ isSigningIn: false, error: message });
      throw error;
    }
  },

  /**
   * Signs out. Every step is independently guarded so a failure in one does not
   * leave the user stuck in a half-signed-in state.
   */
  async logout() {
    try {
      await getSupabase().auth.signOut();
    } catch {
      // Signing out locally is still a sign-out.
    }

    // Clear the in-memory token cache so a stale JWT is never reused.
    try {
      const { clearTokenCache } = await import('@/lib/supabase');
      clearTokenCache();
    } catch {
      // Non-critical.
    }

    try {
      // Drafts belong to the signed-in student; the next user must not see them.
      const { clearLocalData } = await import('@/lib/db/database');
      await clearLocalData();
    } catch {
      // SQLite may be unavailable; not a reason to block sign-out.
    }

    set({ user: null, isAuthenticated: false, error: null });
  },

  async refreshUser() {
    if (!get().isAuthenticated) return;
    try {
      const user = await api.get<AuthenticatedUser>('/auth/me');
      set({ user });
    } catch {
      // Keep the cached identity.
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Reacts to a session ending outside the app (token revoked, password changed
 * elsewhere). Deferred to the next tick so module loading completes first.
 */
setTimeout(() => {
  try {
    getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ user: null, isAuthenticated: false });
      }
    });
  } catch {
    // Supabase not configured; bootstrap surfaces that.
  }
}, 0);
