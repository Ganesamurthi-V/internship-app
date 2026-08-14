/**
 * POST /api/auth/login — delegates to Supabase Auth signInWithPassword.
 *
 * On first login, if no application user record exists, one is created automatically
 * (auto-provisioning). The caller's role is determined by metadata set during signup
 * or admin assignment.
 */

import type { NextRequest } from 'next/server';
import { loginSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling, getRequestContext } from '@/lib/http';
import { unauthorized } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import { buildAuthenticatedUser } from '@/server/auth/identity';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = getRequestContext(request);
  const { email, password } = await parseJson(request, loginSchema);

  // Sign in through Supabase Auth
  const { data, error } = await supabaseAdmin().auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    await recordAudit({
      action: 'login_failure',
      entityType: 'user',
      entityId: null,
      context,
      metadata: { email, reason: error?.message ?? 'unknown' },
    });
    throw unauthorized('Email or password is incorrect.');
  }

  // Ensure the application user record exists (auto-provision on first login)
  let appUser = await prisma.user.findUnique({
    where: { authId: data.user.id },
    select: { id: true },
  });

  if (!appUser) {
    // Check if there's already a user with this email (pre-seeded)
    appUser = await prisma.user.findUnique({
      where: { email: data.user.email! },
      select: { id: true, authId: true },
    });

    if (appUser && !(appUser as { authId?: string }).authId) {
      // Link existing user to the Supabase auth account
      await prisma.user.update({
        where: { id: appUser.id },
        data: { authId: data.user.id },
      });
    } else if (!appUser) {
      // Create a new application user
      const role = (data.user.user_metadata?.role as string) ?? 'student';
      appUser = await prisma.user.create({
        data: {
          authId: data.user.id,
          email: data.user.email!,
          role: role as never,
          status: 'active',
          name: data.user.user_metadata?.name as string ?? null,
        },
        select: { id: true },
      });
    }
  }

  await recordAudit({
    action: 'login_success',
    entityType: 'user',
    entityId: appUser!.id,
    actorUserId: appUser!.id,
    context,
  });

  const user = await buildAuthenticatedUser(data.user.id);

  return ok({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    user,
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
