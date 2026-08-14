/**
 * GET   /api/internships/:id
 * PATCH /api/internships/:id
 *
 * Access is decided by `assertInternshipAccess`, which resolves the caller's
 * relation to the record (owner / assigned mentor / scoped faculty / admin) and
 * checks it against the matrix in 05_API_Spec. A record that exists but is not the
 * caller's returns 403, per 09_Test_Plan §3.
 */

import type { NextRequest } from 'next/server';
import type { InternshipDetail } from '@ims/shared-types';
import { calculateInternshipDuration } from '@ims/shared-validation';
import { updateInternshipSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, canSeeContactDetails } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeInternship, toDateOnly } from '@/lib/serialize';
import { buildDiff, recordAudit } from '@/lib/audit';
import { getAttendanceSummary } from '@/server/attendance/summaryService';
import { getRegistrationChecklist } from '@/server/documents/checklistService';
import { INTERNSHIP_SELECT, updateInternship } from '@/server/internships/internshipService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const internshipId = await uuidRouteParam(context, 'id');

  await assertInternshipAccess(auth, internshipId, 'internship', 'read');

  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: {
      ...INTERNSHIP_SELECT,
      student: {
        select: {
          id: true,
          userId: true,
          registerNumber: true,
          name: true,
          programme: true,
          departmentId: true,
          year: true,
          section: true,
          studentEmail: true,
          mobile: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!internship) throw notFound('Internship not found.');

  const startDate = toDateOnly(internship.startDate);
  const endDate = toDateOnly(internship.endDate);

  const [attendanceSummary, documents] = await Promise.all([
    getAttendanceSummary(internshipId),
    getRegistrationChecklist(internshipId),
  ]);

  const detail: InternshipDetail = {
    internship: serializeInternship(internship, {
      includeContactDetails: canSeeContactDetails(auth, internship.studentId),
    }),
    duration: calculateInternshipDuration(startDate, endDate),
    attendanceSummary,
    documents,
  };

  return ok(detail);
});

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const internshipId = await uuidRouteParam(context, 'id');

  await assertInternshipAccess(auth, internshipId, 'internship', 'write');

  const input = await parseJson(request, updateInternshipSchema);

  const before = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: INTERNSHIP_SELECT,
  });
  if (!before) throw notFound('Internship not found.');

  const updated = await updateInternship(auth, internshipId, input);

  await recordAudit({
    action: 'settings_changed',
    entityType: 'internship',
    entityId: internshipId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { scope: 'internship_details', changes: buildDiff(before, updated) },
  });

  return ok(serializeInternship(updated));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
