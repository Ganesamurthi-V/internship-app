/**
 * GET /api/notifications — the caller's in-app notification list (05_API_Spec).
 *
 * Always scoped to `auth.userId`. The in-app list is the reliable channel: push
 * delivery is best effort, so `sendNotification` writes the row first and every
 * notification appears here regardless of whether the OS delivered it.
 */

import type { NextRequest } from 'next/server';
import { notificationListQuerySchema } from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import { buildPagination, listResponse, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { serializeNotification } from '@/lib/serialize';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, notificationListQuerySchema);

  const where: Prisma.NotificationLogWhereInput = {
    userId: auth.userId,
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(query.type ? { type: query.type } : {}),
  };

  const [total, notifications] = await Promise.all([
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return listResponse(
    notifications.map(serializeNotification),
    buildPagination(total, query.page, query.pageSize),
  );
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
