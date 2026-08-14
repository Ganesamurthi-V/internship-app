/**
 * POST /api/auth/logout — 05_API_Spec "Authentication".
 *
 * Revokes the presented refresh token, or every session when `allDevices` is set.
 *
 * Requires a valid access token, so a stolen refresh token alone cannot be used to
 * log someone out. The device token is deliberately *not* removed here: the client
 * calls `DELETE /api/device-tokens/:token` for that (07_Security_and_Privacy §7),
 * and doing it in one place keeps the two concerns independently testable.
 */

import type { NextRequest } from 'next/server';
import { logoutSchema } from '@ims/shared-validation';
import { noContent, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { revokeAllSessions, revokeSessionById, revokeSessionByToken } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const input = await parseJson(request, logoutSchema);

  let revoked = 0;

  if (input.allDevices) {
    revoked = await revokeAllSessions(auth.userId);
  } else if (input.refreshToken) {
    revoked = (await revokeSessionByToken(input.refreshToken)) ? 1 : 0;
  } else {
    // No refresh token supplied — revoke the session this access token belongs to,
    // so a client that lost its refresh token can still sign out cleanly.
    revoked = await revokeSessionById(auth.userId, auth.sessionId);
  }

  await recordAudit({
    action: 'logout',
    entityType: 'user',
    entityId: auth.userId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { allDevices: input.allDevices, sessionsRevoked: revoked },
  });

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
