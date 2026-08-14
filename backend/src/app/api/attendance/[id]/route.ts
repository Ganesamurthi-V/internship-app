/**
 * PATCH /api/attendance/:id — edit a recorded day.
 * GET   /api/attendance/:id — read one record.
 *
 * Access is resolved from the record's internship, not from the id in the path.
 * 09_Test_Plan §3 tests exactly this: "GET /api/attendance/:id with another
 * student's ID returns 403".
 */

import type { NextRequest } from 'next/server';
import { updateAttendanceSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeAttendance } from '@/lib/serialize';
import { ATTENDANCE_SELECT, updateAttendance } from '@/server/attendance/attendanceService';

/** Resolves the record's internship so authorization can be checked against it. */
async function loadOwningInternshipId(attendanceId: string): Promise<string> {
  const record = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { internshipId: true },
  });
  if (!record) throw notFound('Attendance record not found.');
  return record.internshipId;
}

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const attendanceId = await uuidRouteParam(context, 'id');

  const internshipId = await loadOwningInternshipId(attendanceId);
  await assertInternshipAccess(auth, internshipId, 'attendance', 'read');

  const record = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: ATTENDANCE_SELECT,
  });
  if (!record) throw notFound('Attendance record not found.');

  return ok(serializeAttendance(record));
});

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const attendanceId = await uuidRouteParam(context, 'id');

  const internshipId = await loadOwningInternshipId(attendanceId);
  await assertInternshipAccess(auth, internshipId, 'attendance', 'write');

  const input = await parseJson(request, updateAttendanceSchema);
  const record = await updateAttendance(auth, attendanceId, input);

  return ok(serializeAttendance(record));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
