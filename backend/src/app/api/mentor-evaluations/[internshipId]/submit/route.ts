/**
 * POST /api/mentor-evaluations/:internshipId/submit — digital confirmation.
 *
 * This is the point of no return described in 02_SRS §2.6: the schema requires all
 * ten ratings and `digitalConfirmation: true` (a literal, not a boolean — an explicit
 * affirmative is the mentor's signature), and the record becomes immutable.
 *
 * Only faculty or admin can undo it, via the reopen endpoint.
 */

import type { NextRequest } from 'next/server';
import { submitMentorEvaluationSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { serializeMentorEvaluation } from '@/lib/serialize';
import { submitMentorEvaluation } from '@/server/mentors/evaluationService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const internshipId = await uuidRouteParam(context, 'internshipId');

  await assertInternshipAccess(auth, internshipId, 'mentor_evaluation', 'write');

  const input = await parseJson(request, submitMentorEvaluationSchema);
  const evaluation = await submitMentorEvaluation(auth, internshipId, input);

  return ok(serializeMentorEvaluation(evaluation));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
