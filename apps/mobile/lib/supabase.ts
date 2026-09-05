/**
 * Supabase client for the mobile app.
 *
 * SESSION STORAGE: encrypted, on the device keychain, split across several keys.
 *
 * This used to be a plain `Map`, which meant the session lived only as long as the JS
 * context. It survived a hot reload but not a force-quit, so every user signed in again
 * on every cold start.
 *
 * `expo-secure-store` is the right home for a refresh token — Keychain on iOS, the
 * EncryptedSharedPreferences-backed store on Android — but it caps a single value at
 * 2048 bytes, and a Supabase session is bigger than that: two JWTs plus the whole user
 * object with both metadata bags. Writing it whole is what failed silently before, and a
 * silent write failure reads back as "signed out" a moment after a successful login.
 *
 * So the value is chunked. `<key>` holds the number of chunks and `<key>.0…n` hold the
 * pieces, which keeps every individual write comfortably inside the cap.
 *
 * `@react-native-async-storage/async-storage` was the other candidate and is rejected on
 * two counts: it stores auth tokens in the clear, and v3 throws `Native module is null`
 * in Expo Go.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Characters per chunk.
 *
 * SecureStore's limit is 2048 *bytes* while this splits a JavaScript *string*, and the two
 * only agree for ASCII. A session is nearly all ASCII — JWTs, UUIDs, timestamps — but a
 * student's name sits inside the user object and can be anything, so the size is chosen
 * against the worst case rather than the typical one: three UTF-8 bytes per UTF-16 code
 * unit puts 600 characters at 1800 bytes, still inside the cap.
 *
 * The cost of being conservative is a handful of extra keychain entries per sign-in, which
 * is not worth measuring byte lengths to avoid.
 */
const CHUNK_SIZE = 600;

/**
 * Last-resort store for when the keychain cannot be reached.
 *
 * Chosen over letting the error propagate: a failed keychain read would otherwise abort
 * `getSession()` and strand the user on a blank screen. Falling back to memory degrades to
 * the old behaviour — signed in until the app is killed — instead of not working at all.
 */
const memoryFallback = new Map<string, string>();

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return 0;
  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

async function deleteChunks(key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, index));
  }
}

const storageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return window.localStorage.getItem(key);

    try {
      const count = await readChunkCount(key);
      if (count === 0) return memoryFallback.get(key) ?? null;

      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, index));
        // A missing piece means a write was interrupted. Half a session is not a session,
        // and returning it would hand Supabase malformed JSON, so treat it as absent and
        // let the user sign in again.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      window.localStorage.setItem(key, value);
      return;
    }

    // Mirrored unconditionally so a later keychain failure still has something to read
    // within this run of the app.
    memoryFallback.set(key, value);

    try {
      const previousCount = await readChunkCount(key);

      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
        chunks.push(value.slice(offset, offset + CHUNK_SIZE));
      }

      for (let index = 0; index < chunks.length; index += 1) {
        await SecureStore.setItemAsync(chunkKey(key, index), chunks[index]!);
      }

      // The count is written last, so an interrupted write leaves the old count pointing at
      // chunks that still exist rather than a new count pointing at chunks that do not.
      await SecureStore.setItemAsync(key, String(chunks.length));

      // A shorter session than last time would otherwise leave the tail behind. Harmless to
      // read past, but it is stale token material sitting in the keychain.
      for (let index = chunks.length; index < previousCount; index += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, index));
      }
    } catch {
      // Keychain unavailable. The memory mirror above keeps this session usable.
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      window.localStorage.removeItem(key);
      return;
    }

    memoryFallback.delete(key);

    try {
      const count = await readChunkCount(key);
      await deleteChunks(key, count);
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing actionable: the in-memory copy is already gone, and `logout()` clears the
      // token cache regardless.
    }
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
