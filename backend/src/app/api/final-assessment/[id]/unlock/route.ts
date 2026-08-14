/**
 * POST /api/final-assessment/:id/unlock — faculty only (05_API_Spec).
 *
 * Covers both cases in 02_SRS §2.5 with one action:
 *   - granting early access before the internship end date, and
 *   - reopening an assessment the student has already submitted.
 *
 * Which one happens depends on whether `submitted_at` is set; the service decides and
 * records the mode in the audit metadata. Reopening a submitted assessment is a
 * High-sensitivity audited event (07_Security_and_Privacy §9), so the audit write is
 * strict and a failure fails the request.
 *
 * Uses the `unlock` access level, granted to scoped faculty and admin only — a
 * student cannot unlock their own assessment.
 */

import type { NextRequest } from 'next/server';
import { unlockFinalAssessmentSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, requireRole } from '@/lib/auth/guards';
import { serializeFinalAssessment } from '@/lib/serialize';
import { unlockFinalAssessment } from '@/server/finalAssessment/finalAssessmentService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const internshipId = await uuidRouteParam(context, 'id');
  await assertInternshipAccess(auth, internshipId, 'final_assessment', 'unlock');

  const input = await parseJson(request, unlockFinalAssessmentSchema.default({}));
  const assessment = await unlockFinalAssessment(auth, internshipId, input.reason ?? null);

  return ok(serializeFinalAssessment(assessment));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
