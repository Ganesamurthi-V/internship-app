/**
 * GET /api/auth/me — 05_API_Spec "Authentication".
 *
 * Returns the caller's identity. Used on app launch to decide which role's
 * dashboard to route to (06_App_Flow §2), and as a cheap token liveness check.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { buildAuthenticatedUser } from '@/server/auth/identity';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  return ok(await buildAuthenticatedUser(auth.userId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
