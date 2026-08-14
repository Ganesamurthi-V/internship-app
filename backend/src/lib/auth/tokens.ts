/**
 * JWT access tokens and opaque refresh tokens — 03_TechSpec §3.5.
 *
 *   Access token:  signed JWT, HS256, 15-minute TTL, stateless.
 *   Refresh token: 32 random bytes, opaque, 30-day TTL, stored server-side as a
 *                  SHA-256 hash so it is revocable and a database dump cannot be
 *                  replayed.
 *
 * The access token is deliberately stateless: verifying it must not require a
 * database round trip, which is what keeps the 95th-percentile response target in
 * 03_TechSpec §8 achievable. The cost is that revoking a session takes effect on
 * the next refresh rather than instantly — acceptable for a 15-minute window, and
 * why the TTL is short.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { UserRole } from '@ims/shared-types';
import { env } from '../env';
import { unauthorized } from '../errors';

const secretKey = new TextEncoder().encode(env.AUTH_SECRET);
const ALGORITHM = 'HS256';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  role: UserRole;
  /** Session id, so a refresh can be tied back to the session that issued it. */
  sid: string;
}

/**
 * Signs an access token.
 *
 * Issuer and audience are pinned so a token minted for a different service in the
 * same infrastructure cannot be replayed against this API.
 */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + env.AUTH_ACCESS_TOKEN_EXPIRY)
    .setIssuer(env.AUTH_ISSUER)
    .setAudience(env.AUTH_AUDIENCE)
    .sign(secretKey);
}

/**
 * Verifies an access token and returns its claims.
 *
 * Every failure — bad signature, expired, wrong issuer, malformed claims —
 * collapses to the same 401 with the same message. Distinguishing them would tell
 * an attacker which part of a forged token to fix.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, secretKey, {
      algorithms: [ALGORITHM],
      issuer: env.AUTH_ISSUER,
      audience: env.AUTH_AUDIENCE,
    });
    payload = result.payload;
  } catch {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  const { sub, role, sid } = payload as JWTPayload & { role?: unknown; sid?: unknown };

  if (typeof sub !== 'string' || typeof role !== 'string' || typeof sid !== 'string') {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  return { sub, role: role as UserRole, sid };
}

/**
 * Extracts a bearer token from the Authorization header.
 *
 * React Native uses header-based auth rather than cookies, which is why CSRF does
 * not apply here (03_TechSpec §7).
 */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, ...rest] = authorizationHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

/**
 * Generates an opaque refresh token.
 *
 * 32 bytes of CSPRNG output, base64url encoded. Opaque rather than a JWT because
 * the whole point is that the server decides whether it is still valid — there is
 * nothing useful to encode in it.
 */
export function generateRefreshToken(): string {
  return `rt_${randomBytes(32).toString('base64url')}`;
}

/**
 * Hashes a refresh token for storage.
 *
 * SHA-256 rather than bcrypt: the token is already 256 bits of uniform randomness,
 * so it is not brute-forceable and there is nothing for a slow KDF to protect
 * against. A fast hash also keeps the refresh path from becoming the slowest
 * endpoint in the API, which matters because every client hits it every 15 minutes.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison, for any place a hash is compared outside the database. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// ---------------------------------------------------------------------------
// Single-use tokens: password reset and mentor invites
// ---------------------------------------------------------------------------

/**
 * Generates a single-use token and its storage hash.
 *
 * The plaintext is returned once, for the email or invite URL, and is never
 * recoverable afterwards (07_Security_and_Privacy §5, §6).
 */
export function generateSingleUseToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

export function hashSingleUseToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
