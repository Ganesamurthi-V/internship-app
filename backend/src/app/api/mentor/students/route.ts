/**
 * GET /api/mentor/students — the mentor's assigned students (05_API_Spec).
 *
 * Scoped strictly to the caller's own `mentorId`, resolved from the JWT subject and
 * never from a query parameter. That is what satisfies 09_Test_Plan §3: "Mentor
 * cannot evaluate a student not assigned to them" — a mentor cannot even see another
 * mentor's students to begin with.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireMentorId } from '@/lib/auth/guards';
import { listMentorStudents } from '@/server/mentors/evaluationService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const mentorId = requireMentorId(auth);

  return ok(await listMentorStudents(mentorId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
