/**
 * POST /api/final-assessment/:id/submit — 05_API_Spec "Final Assessment".
 *
 * `submitFinalAssessmentSchema` enforces the completeness rules from 02_SRS §2.5:
 * all eight skill ratings present and 1–5, the usefulness rating set, and the
 * objectives status chosen. Free-text reflections stay optional — an empty box
 * should not stop a student closing out their record.
 *
 * On success the internship moves to `completed`, which is what removes it from the
 * faculty active list and triggers their dashboard update (06_App_Flow §6).
 *
 * The `:id` here is the internship id, matching how the app already holds it. The
 * spec is ambiguous between assessment id and internship id; internship id is
 * chosen because the assessment may not exist yet when the student submits.
 */

import type { NextRequest } from 'next/server';
import { submitFinalAssessmentSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { serializeFinalAssessment } from '@/lib/serialize';
import { submitFinalAssessment } from '@/server/finalAssessment/finalAssessmentService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const internshipId = await uuidRouteParam(context, 'id');

  await assertInternshipAccess(auth, internshipId, 'final_assessment', 'write');

  const input = await parseJson(request, submitFinalAssessmentSchema);
  const assessment = await submitFinalAssessment(auth, internshipId, input);

  return ok(serializeFinalAssessment(assessment));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
