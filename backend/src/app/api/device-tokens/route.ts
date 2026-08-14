/**
 * POST /api/device-tokens — register an Expo push token (05_API_Spec "Device Tokens").
 *
 * Called right after login (06_App_Flow §2). Idempotent by `(user_id,
 * expo_push_token)`, so re-registering on every app launch is the expected usage
 * and simply refreshes `last_active_at`.
 *
 * Every role may register its own token: the authorization matrix row for
 * `/api/device-tokens` is "RW own" for student, mentor and faculty.
 */

import type { NextRequest } from 'next/server';
import { registerDeviceTokenSchema } from '@ims/shared-validation';
import { created, ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { serializeDeviceToken } from '@/server/notifications/serialize';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const input = await parseJson(request, registerDeviceTokenSchema);

  const existing = await prisma.deviceToken.findUnique({
    where: {
      userId_expoPushToken: { userId: auth.userId, expoPushToken: input.expoPushToken },
    },
    select: { id: true },
  });

  const record = await prisma.deviceToken.upsert({
    where: {
      userId_expoPushToken: { userId: auth.userId, expoPushToken: input.expoPushToken },
    },
    create: {
      userId: auth.userId,
      expoPushToken: input.expoPushToken,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
    },
    update: {
      platform: input.platform,
      appVersion: input.appVersion ?? null,
      lastActiveAt: new Date(),
    },
  });

  const payload = serializeDeviceToken(record);
  return existing ? ok(payload) : created(payload);
});

/**
 * GET /api/device-tokens — the caller's registered devices.
 *
 * Not in 05_API_Spec, but it makes the "signed-in devices" view possible and is a
 * read of the caller's own data only.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);

  const tokens = await prisma.deviceToken.findMany({
    where: { userId: auth.userId },
    orderBy: { lastActiveAt: 'desc' },
  });

  return ok(tokens.map(serializeDeviceToken));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
