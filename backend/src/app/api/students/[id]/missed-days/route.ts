/**
 * GET /api/students/:id/missed-days — the days a reviewer could reopen.
 *
 * A missed day never appears in the review queue, because there is no submission to
 * list. Without this endpoint a reviewer would have to work out which days a student
 * was absent for by reading the history and subtracting, then type the date by hand.
 *
 * The window matches the attendance denominator exactly, so every day offered here is
 * a day the student is actually being counted absent for.
 */

import type { NextRequest } from 'next/server';
import { missedDaysQuerySchema } from '@ims/shared-validation';
import { ok, parseQuery, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { enforceRateLimit } from '@/lib/rateLimit';
import { listMissedDays } from '@/server/retakes/retakeService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const studentId = await uuidRouteParam(context, 'id');
  const query = parseQuery(request, missedDaysQuerySchema);

  // The service resolves the caller's relation to this student and refuses anyone
  // outside their department, so no role check is needed here.
  return ok(await listMissedDays(auth, studentId, query));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
