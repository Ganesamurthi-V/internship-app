/**
 * PATCH /api/notifications/:id/read — 05_API_Spec "Notifications".
 *
 * Scoped to the caller, so marking someone else's notification read is a no-op that
 * reports 404 rather than silently succeeding.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeNotification } from '@/lib/serialize';

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const notificationId = await uuidRouteParam(context, 'id');

  // `updateMany` with the user id in the filter makes the ownership check part of the
  // write, so there is no window between reading and updating.
  const result = await prisma.notificationLog.updateMany({
    where: { id: notificationId, userId: auth.userId, readAt: null },
    data: { readAt: new Date() },
  });

  const notification = await prisma.notificationLog.findFirst({
    where: { id: notificationId, userId: auth.userId },
  });

  if (!notification) throw notFound('Notification not found.');

  // `result.count === 0` simply means it was already read, which is not an error.
  void result;

  return ok(serializeNotification(notification));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
