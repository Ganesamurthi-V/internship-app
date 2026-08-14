/**
 * POST /api/auth/logout — signs out the user from Supabase Auth.
 */

import type { NextRequest } from 'next/server';
import { noContent, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);

  // Sign out from Supabase Auth (invalidates the refresh token)
  await supabaseAdmin().auth.admin.signOut(auth.authId);

  await recordAudit({
    action: 'logout',
    entityType: 'user',
    entityId: auth.userId,
    actorUserId: auth.userId,
    context: auth.request,
  });

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
