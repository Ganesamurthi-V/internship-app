/**
 * POST /api/auth/reset-password — 05_API_Spec "Authentication".
 *
 * Consumes the single-use token, sets the new password, and revokes every existing
 * session (07_Security_and_Privacy §5).
 */

import type { NextRequest } from 'next/server';
import { resetPasswordSchema } from '@ims/shared-validation';
import { getRequestContext, noContent, parseJson, withErrorHandling } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { completePasswordReset } from '@/server/auth/passwordResetService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = getRequestContext(request);
  await enforceRateLimit('auth', context.ipAddress);

  const input = await parseJson(request, resetPasswordSchema);
  await completePasswordReset({ token: input.token, password: input.password }, context);

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
