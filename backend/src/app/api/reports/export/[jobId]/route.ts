/**
 * GET /api/reports/export/:jobId — poll status, then download (05_API_Spec).
 *
 * Scoped to the requesting user: an export contains personal data, so only the person
 * who asked for it can retrieve it. Another user's job id returns 404 rather than 403,
 * so the endpoint cannot confirm that a job exists.
 *
 * The download URL is minted fresh on each poll, so it always carries a full
 * 15-minute TTL from the moment the client receives it.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getExportJob } from '@/server/reports/exportService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const jobId = await uuidRouteParam(context, 'jobId');

  return ok(await getExportJob(auth, jobId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
