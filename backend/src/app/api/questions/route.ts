/**
 * GET  /api/questions — the question list
 * POST /api/questions — create one (faculty and admin only)
 *
 * Students read this to render the daily form, which is why GET is open to any
 * authenticated user while POST is reviewer-only.
 */

import type { NextRequest } from 'next/server';
import { createQuestionSchema, questionListQuerySchema } from '@ims/shared-validation';
import { created, ok, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { createQuestion, listQuestions } from '@/server/questions/questionService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, questionListQuerySchema);

  const questions = await listQuestions(auth, {
    activeOnly: query.activeOnly,
    departmentId: query.departmentId,
  });

  return ok(questions);
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, createQuestionSchema);
  return created(await createQuestion(auth, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
