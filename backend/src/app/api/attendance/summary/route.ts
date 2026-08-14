/**
 * GET /api/attendance/summary?internshipId= — 05_API_Spec "Attendance".
 *
 * Returns the shape documented in the spec: working days, days attended/absent/
 * leave, holidays, attendance percentage and total hours. Every value is computed
 * from the attendance rows on each request — 04_Database_Design §5 requires that
 * these are "never stored as a raw number".
 */

import type { NextRequest } from 'next/server';
import { attendanceSummaryQuerySchema } from '@ims/shared-validation';
import { ok, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { getAttendanceSummary } from '@/server/attendance/summaryService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, attendanceSummaryQuerySchema);

  await assertInternshipAccess(auth, query.internshipId, 'attendance', 'read');

  const summary = await getAttendanceSummary(query.internshipId, { to: query.asOf });
  return ok(summary);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
