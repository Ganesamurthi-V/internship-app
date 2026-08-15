/**
 * Authentication context resolution — Supabase Auth with local JWT verification.
 *
 * Performance-optimised flow:
 *   1. Extract bearer token from Authorization header
 *   2. Verify JWT locally using JWKS (no network call after initial key fetch)
 *   3. Look up application user from an in-memory LRU cache (2-min TTL)
 *   4. On cache miss, fetch from Postgres and populate the cache
 *
 * This replaces the previous approach of calling `supabase.auth.getUser()` (remote
 * HTTP) + `prisma.user.findUnique()` (DB) on every single request. The combined
 * saving is 150–400ms per API call.
 */

import type { NextRequest } from 'next/server';
import type { UserRole } from '@ims/shared-types';
import { prisma } from '../prisma';
import { forbidden, unauthorized } from '../errors';
import { getRequestContext, type RequestContext } from '../http';
import { verifySupabaseJwt } from './jwt';
import { userCache, type CachedUser } from './userCache';

export interface AuthContext {
  userId: string;
  /** Supabase auth.users.id */
  authId: string;
  email: string;
  role: UserRole;
  name: string;
  /** Present only for students. Every student-scoped query keys off this. */
  studentId: string | null;
  /**
   * For a student this is their student record's department; for faculty it is
   * their own. Resolved here so callers never have to know which.
   */
  departmentId: string | null;
  request: RequestContext;
}

/**
 * Extracts the bearer token from the Authorization header.
 */
function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) {
    throw unauthorized('Sign in to continue.');
  }

  // Step 1: Verify the JWT locally — pure crypto, no network call
  let authId: string;
  try {
    const verified = await verifySupabaseJwt(token);
    authId = verified.sub;
  } catch {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  // Step 2: Check the user cache
  const cached = userCache.get(authId);
  if (cached) {
    return {
      ...cached,
      role: cached.role as UserRole,
      request: getRequestContext(request),
    };
  }

  // Step 3: Cache miss — fetch from DB
  const user = await prisma.user.findUnique({
    where: { authId },
    select: {
      id: true,
      authId: true,
      email: true,
      role: true,
      status: true,
      name: true,
      departmentId: true,
      student: { select: { id: true, name: true, departmentId: true } },
    },
  });

  if (!user) {
    throw unauthorized('Your account is not set up. Contact your department office.');
  }

  if (user.status !== 'active') {
    throw forbidden('This account is not active. Contact your department office.');
  }

  const entry: CachedUser = {
    userId: user.id,
    authId: user.authId,
    email: user.email,
    role: user.role,
    name: user.student?.name ?? user.name ?? user.email.split('@')[0]!,
    studentId: user.student?.id ?? null,
    departmentId: user.departmentId ?? user.student?.departmentId ?? null,
  };

  userCache.set(authId, entry);

  return {
    ...entry,
    role: entry.role as UserRole,
    request: getRequestContext(request),
  };
}

/**
 * Optional auth — returns null if no valid session, instead of throwing.
 * Used by endpoints that are public but behave differently for authenticated users.
 */
export async function optionalAuth(request: NextRequest): Promise<AuthContext | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  try {
    return await requireAuth(request);
  } catch {
    return null;
  }
}
