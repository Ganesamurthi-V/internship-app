/**
 * PATCH /api/questions/reorder — apply a new display order in one request.
 *
 * A separate route rather than N calls to `PATCH /api/questions/:id`, so dragging a
 * list into place cannot leave it half-sorted if one call fails.
 *
 * Sits above `[id]` in the route tree; `reorder` is not a UUID, so
 * `uuidRouteParam` on the dynamic route would reject it anyway.
 */

import type { NextRequest } from 'next/server';
import { reorderQuestionsSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reorderQuestions } from '@/server/questions/questionService';

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, reorderQuestionsSchema);
  return ok(await reorderQuestions(auth, input.order));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
