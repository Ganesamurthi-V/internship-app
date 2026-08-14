/**
 * GET   /api/mentor-evaluations/:internshipId
 * PATCH /api/mentor-evaluations/:internshipId
 *
 * Keyed by internship id because `mentor_evaluations.internship_id` is UNIQUE
 * (04_Database_Design §2), so it identifies the row, and the evaluation may not
 * exist yet when the mentor first opens the form. 05_API_Spec uses `:internshipId`
 * for the GET and `:id` for the PATCH; this uses the internship id consistently for
 * both.
 *
 * A student may read their own evaluation ("R own" in the matrix) — the ratings a
 * mentor gave them are part of their own record.
 *
 * Returns `data: null` rather than 404 when no evaluation exists, so the mentor form
 * can render empty without treating it as an error.
 */

import type { NextRequest } from 'next/server';
import { updateMentorEvaluationSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { serializeMentorEvaluation } from '@/lib/serialize';
import {
  getMentorEvaluation,
  upsertMentorEvaluation,
} from '@/server/mentors/evaluationService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const internshipId = await uuidRouteParam(context, 'internshipId');

  await assertInternshipAccess(auth, internshipId, 'mentor_evaluation', 'read');

  const evaluation = await getMentorEvaluation(internshipId);
  return ok(evaluation ? serializeMentorEvaluation(evaluation) : null);
});

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const internshipId = await uuidRouteParam(context, 'internshipId');

  await assertInternshipAccess(auth, internshipId, 'mentor_evaluation', 'write');

  const input = await parseJson(request, updateMentorEvaluationSchema);
  const evaluation = await upsertMentorEvaluation(auth, { ...input, internshipId });

  return ok(serializeMentorEvaluation(evaluation));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
