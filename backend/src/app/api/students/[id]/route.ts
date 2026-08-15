/**
 * GET /api/students/:id — one student, for the reviewer's detail view.
 *
 * The mobile number is withheld from faculty by `serializeStudent`, since reviewing a
 * submission does not require it.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertStudentAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getAttendanceSummary, getStudent } from '@/server/students/studentService';
import { listSubmissionHistory } from '@/server/submissions/submissionService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const studentId = await uuidRouteParam(context, 'id');
  await assertStudentAccess(auth, studentId, 'read');

  // The three things the detail screen needs, in one response rather than three calls.
  const [student, summary, history] = await Promise.all([
    getStudent(auth, studentId),
    getAttendanceSummary(studentId),
    listSubmissionHistory(studentId),
  ]);

  return ok({ student, summary, history });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
