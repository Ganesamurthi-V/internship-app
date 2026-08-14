/**
 * Authentication context resolution — now powered by Supabase Auth.
 *
 * `requireAuth` verifies the bearer token by calling `supabase.auth.getUser()`,
 * which validates the JWT signature against Supabase's own signing key. Then it
 * looks up the application user record (with role, student/mentor profile) from
 * Prisma using the Supabase auth user id.
 *
 * The `users` table has an `auth_id` column that links to `auth.users.id` in
 * Supabase. This is the join key.
 */

import type { NextRequest } from 'next/server';
import type { UserRole } from '@ims/shared-types';
import { prisma } from '../prisma';
import { forbidden, unauthorized } from '../errors';
import { getRequestContext, type RequestContext } from '../http';
import { createSupabaseUserClient } from '../supabase';

export interface AuthContext {
  userId: string;
  /** Supabase auth.users.id */
  authId: string;
  email: string;
  role: UserRole;
  name: string;
  studentId: string | null;
  mentorId: string | null;
  departmentId: string | null;
  request: RequestContext;
}

/**
 * Extracts the bearer token from the Authorization header.
 * Supabase Auth tokens come as `Bearer <jwt>`.
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

  // Validate the token with Supabase Auth
  const supabase = createSupabaseUserClient(token);
  const { data: { user: authUser }, error } = await supabase.auth.getUser();

  if (error || !authUser) {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  // Look up the application user by their Supabase auth id
  const user = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: {
      id: true,
      authId: true,
      email: true,
      role: true,
      status: true,
      name: true,
      departmentId: true,
      student: { select: { id: true, name: true, departmentId: true } },
      mentor: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    // The Supabase auth user exists but no application record — maybe they just
    // signed up and the profile hasn't been created yet, or it was deleted.
    throw unauthorized('Your account is not set up. Contact your department office.');
  }

  if (user.status !== 'active') {
    throw forbidden('This account is not active. Contact your department office.');
  }

  return {
    userId: user.id,
    authId: user.authId,
    email: user.email,
    role: user.role as UserRole,
    name: user.student?.name ?? user.mentor?.name ?? user.name ?? user.email.split('@')[0]!,
    studentId: user.student?.id ?? null,
    mentorId: user.mentor?.id ?? null,
    departmentId: user.departmentId ?? user.student?.departmentId ?? null,
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
