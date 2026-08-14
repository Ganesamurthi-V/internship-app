/**
 * POST /api/mentor/invite/:token/accept — mentor claims the invite.
 *
 * In the Supabase Auth flow, the mentor has already signed in via the invite email.
 * This endpoint links their auth account to the mentor record.
 */

import type { NextRequest } from 'next/server';
import { created, routeParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { acceptMentorInvite } from '@/server/mentors/inviteService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const token = decodeURIComponent(await routeParam(context, 'token'));

  const result = await acceptMentorInvite(token, auth.authId, auth.email);

  return created({ userId: result.userId, email: result.email });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
