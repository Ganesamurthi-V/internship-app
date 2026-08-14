/**
 * Supabase service-role client.
 *
 * This client holds the service-role key, which bypasses Row Level Security. It
 * must only ever be imported by server-side modules — never from anything that
 * could be bundled into the Expo app.
 *
 * Scope of use: Storage only. Table access goes through Prisma so that the schema
 * in `prisma/schema.prisma` stays the single source of truth and every query is
 * type-checked against it.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isStorageConfigured } from './env';
import { serverError } from './errors';

const globalForSupabase = globalThis as unknown as {
  supabaseAdmin: SupabaseClient | undefined;
};

function createAdminClient(): SupabaseClient {
  if (!isStorageConfigured) {
    throw serverError(
      'Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      // This is a machine client: there is no browser session to persist, and
      // refreshing tokens on a timer would leak a handle in serverless runtimes.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Lazily created so that importing this module in an environment without Supabase
 * credentials (tests, CI type-checks) does not throw at load time.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!globalForSupabase.supabaseAdmin) {
    globalForSupabase.supabaseAdmin = createAdminClient();
  }
  return globalForSupabase.supabaseAdmin;
}
