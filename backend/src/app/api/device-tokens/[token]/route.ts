/**
 * DELETE /api/device-tokens/:token — unregister on logout (05_API_Spec).
 *
 * 07_Security_and_Privacy §7 requires tokens to be revoked on logout, so the device
 * stops receiving notifications for an account that is no longer signed in there.
 *
 * The delete is scoped to `auth.userId`, so presenting somebody else's push token
 * removes nothing. It returns 204 either way — reporting "not found" would let a
 * caller test whether a given token belongs to another account.
 */

import type { NextRequest } from 'next/server';
import { noContent, routeParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);

  // The token contains `[` and `]`, which arrive percent-encoded in the path.
  const expoPushToken = decodeURIComponent(await routeParam(context, 'token'));

  const result = await prisma.deviceToken.deleteMany({
    where: { userId: auth.userId, expoPushToken },
  });

  logger.debug({ userId: auth.userId, removed: result.count }, 'Device token unregistered');

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
