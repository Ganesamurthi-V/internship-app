/**
 * PATCH /api/notifications/read-all — 05_API_Spec "Notifications".
 *
 * Sits at a static path, which Next matches ahead of the dynamic `[id]` segment, so
 * "read-all" is never treated as a notification id.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);

  const result = await prisma.notificationLog.updateMany({
    where: { userId: auth.userId, readAt: null },
    data: { readAt: new Date() },
  });

  return ok({ markedRead: result.count });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
