/**
 * DELETE /api/retakes/:id — faculty withdraws a retake grant.
 *
 * Marks the grant revoked rather than deleting the row. The question "why does this
 * student have attendance for a day they missed" has to stay answerable, and a
 * deleted row cannot answer it.
 *
 * Returns the updated grant rather than 204 so the app can render the revoked state
 * without a second round trip.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { revokeRetake } from '@/server/retakes/retakeService';

export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const retakeId = await uuidRouteParam(context, 'id');

  return ok(await revokeRetake(auth, retakeId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
