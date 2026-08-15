/**
 * POST /api/submissions/review — review several submissions at once.
 *
 * The scope filter and the `pending` requirement are part of the same `updateMany`
 * predicate, so a bulk action cannot reach outside the caller's department or
 * re-decide something already decided. The response reports how many actually
 * changed rather than how many were asked for.
 */

import type { NextRequest } from 'next/server';
import { bulkReviewSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { bulkReview } from '@/server/submissions/submissionService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, bulkReviewSchema);

  const result = await bulkReview(auth, input.submissionIds, input.decision, input.note ?? null);

  return ok({
    requested: input.submissionIds.length,
    updated: result.updated,
    // A gap means some were already reviewed or out of scope; say so rather than
    // letting the caller assume every id was applied.
    skipped: input.submissionIds.length - result.updated,
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
