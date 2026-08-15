/**
 * Supabase client for the mobile app.
 *
 * SESSION STORAGE: in memory, deliberately.
 *
 * Two native-backed options were tried and rejected. `expo-secure-store` caps a
 * single value at 2048 bytes and a Supabase session exceeds that, so writes failed
 * silently and login appeared to succeed then immediately sign out.
 * `@react-native-async-storage/async-storage` v3 throws `Native module is null` in
 * Expo Go. The adapter below is therefore a plain `Map`.
 *
 * Consequence worth knowing: the session survives a hot reload (same JS context)
 * but not a full app kill, so the user signs in again after force-quitting. That is
 * acceptable for development and is the one thing to change before shipping —
 * either a SecureStore adapter that chunks the value across several keys, or
 * AsyncStorage v2 in a development build.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * In-memory storage that works everywhere without native modules.
 *
 * Sessions persist across hot reloads (Metro keeps the JS context alive) but not
 * across full app restarts. For development this is fine; for production builds,
 * swap this out for a native-backed adapter.
 */
const memoryStorage = new Map<string, string>();

const storageAdapter = {
  getItem: (key: string): string | null => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem(key);
    }
    return memoryStorage.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
      return;
    }
    memoryStorage.set(key, value);
  },
  removeItem: (key: string): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
      return;
    }
    memoryStorage.delete(key);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Supabase not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
          'EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env then restart Metro with --clear.',
      );
    }

    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: storageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Current access token for bearer-header API calls.
 *
 * Cached in memory with a safety margin before JWT expiry so multiple concurrent
 * API requests (e.g. dashboard + today form on mount) don't each call getSession()
 * individually. The SDK still handles refresh under the hood when the token
 * actually expires.
 *
 * The cache is invalidated when Supabase fires a TOKEN_REFRESHED event, so a
 * silent refresh doesn't leave us holding a stale token.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string | null> {
  const now = Date.now();

  // Serve from cache if still valid with a 30-second safety margin
  if (cachedToken && cachedToken.expiresAt - now > 30_000) {
    return cachedToken.value;
  }

  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token ?? null;

  if (token && data.session?.expires_at) {
    cachedToken = {
      value: token,
      // expires_at is Unix seconds
      expiresAt: data.session.expires_at * 1000,
    };
  } else {
    cachedToken = null;
  }

  return token;
}

/** Clear on sign-out so a stale token is never reused after logout. */
export function clearTokenCache(): void {
  cachedToken = null;
}

// Listen for token refresh events so the cache doesn't serve a stale token
// after Supabase silently refreshes in the background.
setTimeout(() => {
  try {
    getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        cachedToken = null;
      }
    });
  } catch {
    // Supabase not configured yet; getSupabase() will throw later with a clear message.
  }
}, 0);
