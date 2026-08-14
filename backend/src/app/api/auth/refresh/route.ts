/**
 * POST /api/auth/refresh — 05_API_Spec "Authentication".
 *
 * Rotates the refresh token on every call (07_Security_and_Privacy §5). The
 * response carries the new refresh token in addition to the access token, which is
 * an additive field beyond the shape sketched in the spec; the client must persist
 * it or the next refresh will be rejected as a reused token.
 */

import type { NextRequest } from 'next/server';
import type { RefreshResponse } from '@ims/shared-types';
import { refreshSchema } from '@ims/shared-validation';
import { env } from '@/lib/env';
import { getRequestContext, ok, parseJson, withErrorHandling } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { rotateSession } from '@/lib/auth/session';
import { signAccessToken } from '@/lib/auth/tokens';
import { prisma } from '@/lib/prisma';
import { unauthorized } from '@/lib/errors';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = getRequestContext(request);
  const { refreshToken } = await parseJson(request, refreshSchema);

  // Keyed by IP: the caller is by definition not yet authenticated on this request.
  await enforceRateLimit('auth', context.ipAddress);

  const rotated = await rotateSession(refreshToken, context);

  // Read the role fresh rather than trusting the old token, so a role change or
  // suspension takes effect at the next refresh.
  const user = await prisma.user.findUnique({
    where: { id: rotated.userId },
    select: { role: true, status: true },
  });

  if (!user || user.status !== 'active') {
    throw unauthorized('Your session is no longer valid. Sign in again.');
  }

  const accessToken = await signAccessToken({
    sub: rotated.userId,
    role: user.role,
    sid: rotated.sessionId,
  });

  const response: RefreshResponse = {
    accessToken,
    refreshToken: rotated.refreshToken,
    expiresIn: env.AUTH_ACCESS_TOKEN_EXPIRY,
  };

  return ok(response);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
