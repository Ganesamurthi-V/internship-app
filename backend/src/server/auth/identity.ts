/**
 * Builds the `AuthenticatedUser` blob returned by `GET /api/auth/me`.
 *
 * Takes a Supabase `auth_id` and resolves it to the application user. This is the
 * one place the client learns its own `studentId`, which every student-scoped
 * endpoint then derives server-side rather than accepting from the request.
 */

import type { AuthenticatedUser, UserRole, UserStatus } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { unauthorized } from '@/lib/errors';

export async function buildAuthenticatedUser(authId: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { authId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      name: true,
      departmentId: true,
      student: { select: { id: true, name: true, departmentId: true } },
    },
  });

  if (!user) {
    throw unauthorized(
      'Your account is not set up. Contact your department office.',
    );
  }

  const identity: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    status: user.status as UserStatus,
    name: user.student?.name ?? user.name ?? user.email.split('@')[0]!,
    // A student's department lives on their student record; faculty carry their
    // own. Resolving it here means callers never have to know which.
    departmentId: user.departmentId ?? user.student?.departmentId ?? null,
  };

  if (user.student) {
    identity.studentId = user.student.id;
  }

  return identity;
}
