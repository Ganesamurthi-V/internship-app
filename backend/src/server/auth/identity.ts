/**
 * Builds the `AuthenticatedUser` blob returned by login and `GET /api/auth/me`.
 *
 * Takes a Supabase `auth_id` and resolves it to the application user.
 */

import type { AuthenticatedUser, UserRole } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { unauthorized } from '@/lib/errors';

export async function buildAuthenticatedUser(authId: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { authId },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      student: {
        select: {
          id: true,
          name: true,
          internships: {
            where: { status: { in: ['approved', 'active', 'pending'] } },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            take: 1,
            select: { id: true },
          },
        },
      },
      mentor: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    throw unauthorized('Your account is not set up. Sign up first or contact your department office.');
  }

  const identity: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    name: user.student?.name ?? user.mentor?.name ?? user.name ?? user.email.split('@')[0]!,
  };

  if (user.student) {
    identity.studentId = user.student.id;
    identity.activeInternshipId = user.student.internships[0]?.id ?? null;
  }

  if (user.mentor) {
    identity.mentorId = user.mentor.id;
  }

  return identity;
}
