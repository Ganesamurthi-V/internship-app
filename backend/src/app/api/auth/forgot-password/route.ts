/**
 * POST /api/auth/forgot-password — delegates to Supabase Auth resetPasswordForEmail.
 *
 * Supabase sends the reset email automatically. Always returns 204 regardless of
 * whether the email exists, to prevent enumeration.
 */

import type { NextRequest } from 'next/server';
import { forgotPasswordSchema } from '@ims/shared-validation';
import { noContent, parseJson, withErrorHandling } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { email } = await parseJson(request, forgotPasswordSchema);

  await supabaseAdmin().auth.resetPasswordForEmail(email, {
    redirectTo: `${env.WEB_APP_URL}/reset-password`,
  });

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
