/**
 * POST /api/mentor-evaluations/:internshipId/reopen — faculty/admin only.
 *
 * Not named in 05_API_Spec, but 02_SRS §2.6 requires the capability: "Immutable after
 * digital confirmation unless faculty/admin reopens." Without an endpoint, that
 * escape hatch would only exist by editing the database directly.
 *
 * Uses the `unlock` access level, the same one that reopens a final assessment, and
 * is audited at High sensitivity with the reason recorded.
 */

import type { NextRequest } from 'next/server';
import { reopenMentorEvaluationSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess, requireRole } from '@/lib/auth/guards';
import { serializeMentorEvaluation } from '@/lib/serialize';
import { reopenMentorEvaluation } from '@/server/mentors/evaluationService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const internshipId = await uuidRouteParam(context, 'internshipId');
  await assertInternshipAccess(auth, internshipId, 'mentor_evaluation', 'unlock');

  const input = await parseJson(request, reopenMentorEvaluationSchema.default({}));
  const evaluation = await reopenMentorEvaluation(auth, internshipId, input.reason ?? null);

  return ok(serializeMentorEvaluation(evaluation));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
