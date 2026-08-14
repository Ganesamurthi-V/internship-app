/**
 * Supabase client for the mobile app.
 *
 * SESSION STORAGE: In-memory with no crash path.
 *
 * We tried expo-secure-store (2048-byte limit breaks Supabase JWTs) and
 * @react-native-async-storage/async-storage v3 (native module null in Expo Go).
 * Both fail in Expo Go but work in development builds.
 *
 * For Expo Go development: sessions live in a JS Map. They survive hot-reloads
 * (same JS context) but not full app kills. That's acceptable for development.
 *
 * For production (eas build): swap the adapter to expo-secure-store with chunking,
 * or use AsyncStorage v2 which is bundled in dev builds.
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
 * The SDK refreshes on demand so this is always valid.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
