/**
 * GET  /api/retakes — retake grants the caller may see.
 * POST /api/retakes — faculty reopens one closed day for one student.
 *
 * The GET is open to students as well as reviewers: a student has to be able to see
 * a grant to use it. Scoping happens inside the service as a query predicate, so a
 * student asking for someone else's grants gets an empty list rather than a 403 that
 * would confirm the other student exists.
 *
 * The POST is the only way a recorded absence can become a recorded presence, so it
 * is reviewer-only and every call is audited.
 */

import type { NextRequest } from 'next/server';
import { grantRetakeSchema, retakeListQuerySchema } from '@ims/shared-validation';
import { created, ok, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { grantRetake, listRetakes } from '@/server/retakes/retakeService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, retakeListQuerySchema);

  return ok(await listRetakes(auth, query));
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, grantRetakeSchema);

  return created(await grantRetake(auth, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
