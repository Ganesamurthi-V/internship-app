/**
 * POST /api/auth/reset-password — updates password via Supabase Auth.
 *
 * The user must have a valid session (from the reset link callback) to call this.
 * The mobile app can also use this after verifying the reset token via deep link.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { noContent, parseJson, withErrorHandling } from '@/lib/http';
import { unauthorized } from '@/lib/errors';
import { createSupabaseUserClient } from '@/lib/supabase';

const schema = z.object({
  accessToken: z.string().min(1, 'Access token is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { accessToken, password } = await parseJson(request, schema);

  const supabase = createSupabaseUserClient(accessToken);
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw unauthorized(error.message || 'Could not update password.');
  }

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
