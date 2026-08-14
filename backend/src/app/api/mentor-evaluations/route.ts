/**
 * POST /api/mentor-evaluations — save a draft evaluation.
 *
 * 05_API_Spec matrix: "R own | RW assigned | R scoped | RW". Only the assigned
 * mentor and admin may write; faculty may read but not author, which is why
 * `ACCESS_MATRIX` omits `scoped_faculty` from the `write` level on this resource.
 */

import type { NextRequest } from 'next/server';
import { upsertMentorEvaluationSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { serializeMentorEvaluation } from '@/lib/serialize';
import { upsertMentorEvaluation } from '@/server/mentors/evaluationService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, upsertMentorEvaluationSchema);
  await assertInternshipAccess(auth, input.internshipId, 'mentor_evaluation', 'write');

  const evaluation = await upsertMentorEvaluation(auth, input);
  return ok(serializeMentorEvaluation(evaluation));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
