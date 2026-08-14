/**
 * GET /api/auth/me — returns the authenticated user's identity.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { buildAuthenticatedUser } from '@/server/auth/identity';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  return ok(await buildAuthenticatedUser(auth.authId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
