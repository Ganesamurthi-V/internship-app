/**
 * POST /api/auth/forgot-password — 05_API_Spec "Authentication".
 *
 * Always returns 204, whether or not the address is registered. Reporting "no such
 * account" would make this unauthenticated endpoint an email enumeration oracle.
 */

import type { NextRequest } from 'next/server';
import { forgotPasswordSchema } from '@ims/shared-validation';
import { getRequestContext, noContent, parseJson, withErrorHandling } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { requestPasswordReset } from '@/server/auth/passwordResetService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = getRequestContext(request);
  const { email } = await parseJson(request, forgotPasswordSchema);

  // Limited per IP and per email so the endpoint cannot be used to spam an inbox.
  await enforceRateLimit('auth', context.ipAddress);
  await enforceRateLimit('auth', `reset:${email}`);

  await requestPasswordReset(email, context);
  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
