/**
 * Supabase clients for the backend.
 *
 * Two clients:
 *   - `supabaseAdmin()` — service-role key, bypasses RLS. Used for Storage and
 *     for admin operations that need to read across all users.
 *   - `createSupabaseServerClient(accessToken)` — validates a user's JWT and returns
 *     a client scoped to that user. Used for auth verification in request handlers.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// ---------------------------------------------------------------------------
// Admin client (service-role — bypasses RLS)
// ---------------------------------------------------------------------------

const globalForSupabase = globalThis as unknown as {
  supabaseAdmin: SupabaseClient | undefined;
};

function createAdminClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * The shared service-role client, for privileged reads/writes and Storage.
 *
 * IMPORTANT: never call a sign-in method on this client.
 *
 * It is memoized on `globalThis`, so the instance outlives a single request on a
 * warm serverless instance. `signInWithPassword` stores the resulting session on
 * the client and from then on sends the *user's* access token instead of the
 * service-role key. Every later caller on that instance silently drops to
 * `authenticated`, which RLS then blocks — and worse, one request can act as a
 * user from an earlier, unrelated request.
 *
 * Use `createSupabaseSignInClient()` for anything that authenticates a user.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!globalForSupabase.supabaseAdmin) {
    globalForSupabase.supabaseAdmin = createAdminClient();
  }
  return globalForSupabase.supabaseAdmin;
}

/**
 * A throwaway client for password sign-in.
 *
 * Deliberately NOT memoized: signing in mutates the client's auth state, so it must
 * not be shared across requests. Uses the anon key because sign-in is a public
 * operation and this client must never carry service-role privileges.
 */
export function createSupabaseSignInClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// User-scoped client (validates access token from the request)
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client using the user's access token.
 * Used to call `supabase.auth.getUser()` to verify the token and get the user.
 */
export function createSupabaseUserClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
