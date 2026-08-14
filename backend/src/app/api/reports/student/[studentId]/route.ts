/**
 * GET /api/reports/student/:studentId — full student evidence summary (05_API_Spec).
 *
 * Resolves the student's most recent internship and returns its evidence package. The
 * `internshipId`-keyed variant is `/api/reports/evidence`; this one exists because the
 * faculty student list holds a student id, not an internship id.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, assertStudentAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { buildStudentEvidence } from '@/server/reports/evidenceService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const studentId = await uuidRouteParam(context, 'studentId');

  await enforceRateLimit('general', auth.userId);

  // Two checks, deliberately: the student must be visible to the caller, and the
  // internship must be readable. The second is what a mentor passes on and a
  // department-scoped faculty member fails on for an out-of-scope record.
  await assertStudentAccess(auth, studentId, 'read');

  const internship = await prisma.internship.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!internship) throw notFound('This student has no internship record.');

  await assertInternshipAccess(auth, internship.id, 'internship', 'read');

  return ok(await buildStudentEvidence(internship.id));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
