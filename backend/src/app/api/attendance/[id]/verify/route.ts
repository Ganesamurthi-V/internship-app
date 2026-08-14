/**
 * POST /api/attendance/:id/verify — mentor or faculty confirmation (05_API_Spec).
 *
 * Uses the `verify` access level, which the matrix grants to the assigned mentor,
 * scoped faculty and admin — but not to the student, who cannot verify their own
 * attendance.
 *
 * 02_SRS §2.2 calls this "a soft confirmation, not a gate", so it never changes
 * whether the record counts toward attendance. Passing `verified: false` withdraws
 * a previous confirmation rather than deleting anything.
 */

import type { NextRequest } from 'next/server';
import { verifyAttendanceSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeAttendance } from '@/lib/serialize';
import { setAttendanceVerification } from '@/server/attendance/attendanceService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const attendanceId = await uuidRouteParam(context, 'id');

  const record = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { internshipId: true },
  });
  if (!record) throw notFound('Attendance record not found.');

  await assertInternshipAccess(auth, record.internshipId, 'attendance', 'verify');

  // An empty body is valid and means "verify".
  const input = await parseJson(request, verifyAttendanceSchema.default({ verified: true }));

  const updated = await setAttendanceVerification(auth, attendanceId, input.verified);
  return ok(serializeAttendance(updated));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
