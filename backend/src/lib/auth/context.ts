/**
 * Authentication context resolution.
 *
 * `requireAuth` is the entry point for every protected route. It verifies the
 * bearer token and then loads the current user state from the database.
 *
 * That database read is deliberate. The access token carries only `sub`, `role`
 * and `sid`, so everything an authorization decision needs — account status, the
 * caller's `studentId` / `mentorId`, a faculty member's department — is resolved
 * server-side. 07_Security_and_Privacy §6 is explicit: "Never trust `userId`,
 * `studentId`, `role` fields supplied by client — always derive from JWT subject."
 * Reading status here is also what makes suspending an account take effect within
 * the 15-minute access-token window rather than at its expiry.
 */

import type { NextRequest } from 'next/server';
import type { UserRole } from '@ims/shared-types';
import { prisma } from '../prisma';
import { forbidden, unauthorized } from '../errors';
import { getRequestContext, type RequestContext } from '../http';
import { extractBearerToken, verifyAccessToken } from './tokens';

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  /** Display name: the student/mentor profile name, or the user's own name field. */
  name: string;
  /** Set only for students. The anchor for every student ownership check. */
  studentId: string | null;
  /** Set only for mentors. The anchor for every mentor assignment check. */
  mentorId: string | null;
  /**
   * The department this user belongs to, whichever role they hold.
   *
   * Staff read it from `users.department_id`; students read it from
   * `students.department_id`. Unifying them is safe because every scoping helper in
   * guards.ts branches on role before consulting this field — a student is never
   * matched by the faculty department rule. Mentors have no department.
   */
  departmentId: string | null;
  request: RequestContext;
}

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) {
    throw unauthorized('Sign in to continue.');
  }

  const claims = await verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
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
    // The account was deleted while a valid token was still in flight.
    throw unauthorized('Your session is no longer valid. Sign in again.');
  }

  if (user.status !== 'active') {
    throw forbidden('This account is not active. Contact your department office.');
  }

  // The role in the token could be stale if an admin changed it mid-session. The
  // database value wins, so a demotion takes effect immediately.
  const role = user.role as UserRole;

  return {
    userId: user.id,
    email: user.email,
    role,
    sessionId: claims.sid,
    name: user.student?.name ?? user.mentor?.name ?? user.name ?? user.email.split('@')[0]!,
    studentId: user.student?.id ?? null,
    mentorId: user.mentor?.id ?? null,
    departmentId: user.departmentId ?? user.student?.departmentId ?? null,
    request: getRequestContext(request),
  };
}

/**
 * Resolves an auth context when one is present, without failing if it is not.
 * Used by endpoints that are public but behave differently for a signed-in caller.
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
