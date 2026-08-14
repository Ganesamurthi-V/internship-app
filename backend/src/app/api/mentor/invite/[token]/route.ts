/**
 * GET /api/mentor/invite/:token — public invite validation (05_API_Spec).
 *
 * The only unauthenticated endpoint that returns any student data, so it is
 * deliberately narrow: the mentor's own name, the organisation, and the name and
 * register number of the one student they are being asked to evaluate. Nothing
 * else. 07_Security_and_Privacy §8 forbids exposing student information through
 * unauthenticated endpoints, and this is the documented exception, kept minimal.
 *
 * Rate limited by IP because it is unauthenticated and takes a guessable-looking
 * path parameter. An invalid token returns 404 with no detail, so the endpoint
 * cannot be used to enumerate live tokens.
 */

import type { NextRequest } from 'next/server';
import {
  getRequestContext,
  ok,
  routeParam,
  withErrorHandling,
  type RouteContext,
} from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { validateMentorInvite } from '@/server/mentors/inviteService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const requestContext = getRequestContext(request);
  await enforceRateLimit('auth', requestContext.ipAddress);

  const token = decodeURIComponent(await routeParam(context, 'token'));
  const invite = await validateMentorInvite(token);

  return ok(invite);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
