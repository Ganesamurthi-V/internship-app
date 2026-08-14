/**
 * POST /api/mentors/:id/invite — issue a secure invite link (faculty/admin).
 *
 * 08_Implementation_Plan Phase 5, step 1. The response includes the invite URL so
 * faculty can copy it and share it out of band when email delivery is not
 * configured — which, given `mailer.ts` has no provider wired, is the current
 * default. That is why this returns the URL rather than only a confirmation.
 *
 * Also notifies the mentor by push if they already have an account and a device.
 */

import type { NextRequest } from 'next/server';
import { createMentorInviteSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { NOTIFICATIONS, sendNotification } from '@/lib/push';
import { createMentorInvite } from '@/server/mentors/inviteService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const mentorId = await uuidRouteParam(context, 'id');

  // `mentorId` in the body is redundant with the path; the path wins.
  const body = await parseJson(request, createMentorInviteSchema.partial({ mentorId: true }));

  const invite = await createMentorInvite(auth, mentorId, body.expiresInDays ?? 14);

  const mentor = await prisma.mentor.findUnique({
    where: { id: mentorId },
    select: { userId: true },
  });

  if (mentor?.userId) {
    await sendNotification({ ...NOTIFICATIONS.mentorEvaluationRequest(), userId: mentor.userId });
  }

  return ok({
    inviteUrl: invite.inviteUrl,
    expiresAt: invite.expiresAt.toISOString(),
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
