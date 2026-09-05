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
import { USER_ROLES } from '@ims/shared-types';
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
 * Builds a provisional identity from the Supabase session alone.
 *
 * Used when `/auth/me` is unreachable, so a valid session is not thrown away over a
 * network blip — treating it as signed out is far more confusing than showing an error
 * inside the app.
 *
 * WHY THE ROLE IS NOT READ FROM `user_metadata`
 *
 * It used to be, and that was a privilege problem. `user_metadata` is writable by the
 * account holder with nothing but the anon key:
 *
 *     supabase.auth.updateUser({ data: { role: 'admin' } })
 *
 * so a student could name their own role, and a failing `/auth/me` — airplane mode at
 * launch is enough — would route them into the admin area. Every screen there still reads
 * from the API, which authorises server-side, so no data actually leaked. But the app was
 * deciding who someone was from a field they control, which is the wrong shape regardless
 * of what saves it downstream.
 *
 * `app_metadata` is the counterpart only the service role can write, so it is the one
 * claim in the token worth trusting. When it is missing — an account created before the
 * backend started setting it — this falls back to the least privilege it can, rather than
 * to whatever the holder would like to be. `refreshUser()` on foreground replaces the
 * guess with the server's answer, so a faculty member never stays parked in the student
 * area.
 */
function identityFromSession(session: {
  user: {
    id: string;
    email?: string | undefined;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
}): AuthenticatedUser {
  const userMetadata = session.user.user_metadata ?? {};
  const appMetadata = session.user.app_metadata ?? {};
  const email = session.user.email ?? '';

  // Validated against the enum rather than cast. A cast would let any string through as a
  // `UserRole` and put an unroutable value into the guards.
  const claimed = appMetadata.role;
  const role: UserRole =
    typeof claimed === 'string' && (USER_ROLES as readonly string[]).includes(claimed)
      ? (claimed as UserRole)
      : 'student';

  return {
    id: session.user.id,
    email,
    // Display only, so `user_metadata` is fine here: the worst a holder can do by editing
    // it is change the name shown back to themselves.
    name: (userMetadata.name as string) ?? email.split('@')[0] ?? 'User',
    role,
    // Not `'active'`. That was an unverifiable claim, and asserting it meant a suspended
    // account got a working interface until its first request came back rejected. There is
    // no "unknown" in `UserStatus`, so this takes the value that grants least: anything
    // that ever gates on `status === 'active'` fails closed until `/auth/me` answers.
    status: 'pending',
    // Not in the JWT. Anything department-scoped waits for `/auth/me`.
    departmentId: null,
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

    // Clear the React Query cache so the next user doesn't see stale data from
    // the previous account (e.g. a student's dashboard showing for a faculty login).
    try {
      const { queryClient } = await import('@/app/_layout');
      queryClient.clear();
    } catch {
      // Non-critical.
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
        // Also clear the query cache so stale personal data doesn't linger if the
        // session expired silently (not through our logout() flow).
        import('@/app/_layout')
          .then(({ queryClient }) => queryClient.clear())
          .catch(() => {});
      }
    });
  } catch {
    // Supabase not configured; bootstrap surfaces that.
  }
}, 0);
