/**
 * POST /api/mentor/invite/:token/accept — mentor claims the invite and sets a password.
 *
 * Optional step. A mentor who only wants to submit one evaluation can do it through
 * the invite link without an account (08_Implementation_Plan Phase 0: "no app
 * install"). This exists for mentors supervising several students over time, who
 * benefit from signing in properly.
 *
 * On success the invite is consumed, so the link cannot create a second account.
 */

import type { NextRequest } from 'next/server';
import { acceptMentorInviteSchema } from '@ims/shared-validation';
import {
  created,
  getRequestContext,
  parseJson,
  routeParam,
  withErrorHandling,
  type RouteContext,
} from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { acceptMentorInvite } from '@/server/mentors/inviteService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const requestContext = getRequestContext(request);
  await enforceRateLimit('auth', requestContext.ipAddress);

  const token = decodeURIComponent(await routeParam(context, 'token'));

  // The token comes from the path; the body supplies only the password.
  const body = await parseJson(request, acceptMentorInviteSchema.partial({ token: true }));

  const result = await acceptMentorInvite(
    { token, password: body.password },
    requestContext,
  );

  return created({ userId: result.userId, email: result.email });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
