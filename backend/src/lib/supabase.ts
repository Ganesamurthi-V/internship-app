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

export function supabaseAdmin(): SupabaseClient {
  if (!globalForSupabase.supabaseAdmin) {
    globalForSupabase.supabaseAdmin = createAdminClient();
  }
  return globalForSupabase.supabaseAdmin;
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
