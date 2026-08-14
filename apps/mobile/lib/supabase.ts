/**
 * Supabase client for the mobile app.
 *
 * IMPORTANT: expo-secure-store has a 2048 byte limit per value in Expo Go.
 * Supabase session tokens exceed this. We use a simple AsyncStorage-like approach
 * with MMKV or just in-memory + AsyncStorage fallback for Expo Go compatibility.
 *
 * For production builds, switch back to expo-secure-store.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Storage adapter that works in Expo Go.
 * 
 * expo-secure-store has a 2048-byte limit per item which Supabase JWTs exceed.
 * This uses a simple in-memory + React Native AsyncStorage approach instead.
 * For production (development builds), swap to expo-secure-store with chunking.
 */
const storage = new Map<string, string>();

const InMemoryStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    }
    return storage.get(key) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    storage.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.removeItem(key);
      return;
    }
    storage.delete(key);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Supabase configuration missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env'
      );
    }

    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: InMemoryStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Returns the current access token for API calls, or null if not signed in.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
