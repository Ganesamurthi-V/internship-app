/**
 * POST /api/auth/refresh — delegates to Supabase Auth refreshSession.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { unauthorized } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { refreshToken } = await parseJson(request, refreshSchema);

  const { data, error } = await supabaseAdmin().auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  return ok({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
