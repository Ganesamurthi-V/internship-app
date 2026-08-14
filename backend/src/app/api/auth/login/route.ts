/**
 * POST /api/auth/login — 05_API_Spec "Authentication".
 *
 * Rate limited at 10/min per IP *and* per email (07_Security_and_Privacy §6),
 * which is why the body is parsed before the limiter runs: the email is part of
 * the limiter key.
 */

import type { NextRequest } from 'next/server';
import { loginSchema } from '@ims/shared-validation';
import { getRequestContext, ok, parseJson, withErrorHandling } from '@/lib/http';
import { enforceLoginRateLimit } from '@/lib/rateLimit';
import { login } from '@/server/auth/loginService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = getRequestContext(request);
  const credentials = await parseJson(request, loginSchema);

  await enforceLoginRateLimit(context.ipAddress, credentials.email);

  const result = await login(credentials, context);
  return ok(result);
});

/**
 * Route segment config. `force-dynamic` because auth depends on request headers and
 * must never be prerendered or cached; `nodejs` because bcrypt is not available in
 * the edge runtime.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
