/**
 * POST /api/attendance — record a day (student)
 * GET  /api/attendance?internshipId=&from=&to= — list
 *
 * 05_API_Spec matrix: "RW own | R/Verify assigned | RW scoped | RW".
 *
 * The POST returns 200 rather than 201 when the submission was a replay identified
 * by `clientId`, so an offline client retrying a request it already succeeded with
 * gets a clear signal instead of a 409.
 */

import type { NextRequest } from 'next/server';
import { attendanceListQuerySchema, createAttendanceSchema } from '@ims/shared-validation';
import { created, ok, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { dateRangeFilter } from '@/lib/clock';
import { serializeAttendance } from '@/lib/serialize';
import { ATTENDANCE_SELECT, upsertAttendance } from '@/server/attendance/attendanceService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, createAttendanceSchema);
  await assertInternshipAccess(auth, input.internshipId, 'attendance', 'write');

  const result = await upsertAttendance(auth, input);
  const payload = serializeAttendance(result.record);

  return result.status === 'created' ? created(payload) : ok(payload);
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, attendanceListQuerySchema);

  await assertInternshipAccess(auth, query.internshipId, 'attendance', 'read');

  const dateFilter = dateRangeFilter(query.from, query.to);

  const records = await prisma.attendance.findMany({
    where: {
      internshipId: query.internshipId,
      ...(dateFilter ? { attendanceDate: dateFilter } : {}),
    },
    // Newest first, matching the history list in 12_Mobile_App_Spec §2.
    orderBy: { attendanceDate: 'desc' },
    select: ATTENDANCE_SELECT,
  });

  // Returned unpaginated on purpose: an internship is bounded (a few hundred days
  // at most), and the calendar heatmap needs the whole range at once.
  return ok(records.map(serializeAttendance));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
