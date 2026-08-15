/**
 * POST /api/submissions/:id/review — approve or decline.
 *
 * One endpoint for both decisions rather than `/approve` and `/decline`, because the
 * two share every rule except the resulting status, and a single handler cannot
 * drift between them. The decline reason is enforced by the schema.
 */

import type { NextRequest } from 'next/server';
import { reviewSubmissionSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertSubmissionAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reviewSubmission } from '@/server/submissions/submissionService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const submissionId = await uuidRouteParam(context, 'id');
  // `review` is granted to scoped faculty and admin only; a student holding their
  // own submission id resolves to `owner`, which the matrix denies.
  await assertSubmissionAccess(auth, submissionId, 'review');

  const input = await parseJson(request, reviewSubmissionSchema);

  return ok(await reviewSubmission(auth, submissionId, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
