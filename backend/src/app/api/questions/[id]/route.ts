/**
 * GET    /api/questions/:id
 * PATCH  /api/questions/:id — update (faculty and admin)
 * DELETE /api/questions/:id — retire, or hard-delete when never answered
 */

import type { NextRequest } from 'next/server';
import { updateQuestionSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getQuestion, retireQuestion, updateQuestion } from '@/server/questions/questionService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const questionId = await uuidRouteParam(context, 'id');
  return ok(await getQuestion(questionId));
});

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const questionId = await uuidRouteParam(context, 'id');
  const input = await parseJson(request, updateQuestionSchema);

  return ok(await updateQuestion(auth, questionId, input));
});

export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const questionId = await uuidRouteParam(context, 'id');
  const result = await retireQuestion(auth, questionId);

  // Says which happened, because "retired" and "deleted" mean different things to
  // whoever is looking at the list afterwards.
  return ok({
    deleted: result.deleted,
    message: result.deleted
      ? 'Question deleted.'
      : 'Question retired. Past answers are preserved.',
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
