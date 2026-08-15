/**
 * Local JWT verification using Supabase's JWKS endpoint.
 *
 * Replaces the remote `supabase.auth.getUser()` call that added 100–300ms to every
 * API request. The public key is fetched once and then cached by `jose`'s
 * `createRemoteJWKSet`. Token validation is a pure-crypto operation: ~0ms.
 *
 * Supabase JWTs are RS256, issued by `<project>.supabase.co/auth/v1` with audience
 * "authenticated". The `sub` claim is the auth user's UUID (`auth.users.id`).
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

const JWKS_URL = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);

// `createRemoteJWKSet` caches the JWKS automatically and refreshes on signature
// mismatch (key rotation). No manual invalidation needed.
const JWKS = createRemoteJWKSet(JWKS_URL);

export interface VerifiedToken {
  /** auth.users.id */
  sub: string;
  email: string;
}

/**
 * Verifies a Supabase access token locally (no network call after initial JWKS fetch).
 * Throws if the token is expired, malformed, or signed with an unknown key.
 */
export async function verifySupabaseJwt(token: string): Promise<VerifiedToken> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  });

  if (!payload.sub) {
    throw new Error('JWT is missing sub claim.');
  }

  return {
    sub: payload.sub,
    email: (payload as { email?: string }).email ?? '',
  };
}
