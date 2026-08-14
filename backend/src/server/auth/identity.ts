/**
 * Builds the `AuthenticatedUser` blob returned by login, refresh and
 * `GET /api/auth/me` (05_API_Spec "Authentication").
 *
 * Domain logic lives under `src/server/<domain>/`, mirroring the
 * `backend/src/auth`, `backend/src/students`, ... layout in 03_TechSpec §4. The
 * `src/app/api/**` tree holds only the thin HTTP layer, because Next.js reserves
 * those paths for routing.
 */

import type { AuthenticatedUser, UserRole } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { unauthorized } from '@/lib/errors';

/**
 * Resolves the display identity for a user.
 *
 * `name` falls back through student profile → mentor profile → the user's own name
 * column → the email local part, so the app always has something to greet the user
 * with even for a freshly created faculty account.
 *
 * `activeInternshipId` is included for students so the app can skip a round trip
 * on launch; it picks the internship the student is actually working in, preferring
 * an active or approved one over a pending or completed record.
 */
export async function buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
            // 'active' sorts before 'approved' before 'pending' alphabetically,
            // which happens to be the priority we want; the newest wins on ties.
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
    throw unauthorized('Your session is no longer valid. Sign in again.');
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
