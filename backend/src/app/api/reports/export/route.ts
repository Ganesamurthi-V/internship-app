/**
 * POST /api/reports/export — 05_API_Spec "Reports": async, returns a job id.
 *
 * Rate limited to 5/min per user (07_Security_and_Privacy §6), because rendering an
 * evidence package is the most expensive operation in the API.
 *
 * Returns 202 with the job. The job is currently rendered inline before the response
 * is sent, so it will usually already be `ready` — but the client should still poll
 * `GET /api/reports/export/:jobId`, because that contract is what allows execution to
 * move to a worker without a client change. See the note at the top of exportService.
 */

import type { NextRequest } from 'next/server';
import { createExportSchema } from '@ims/shared-validation';
import { NextResponse } from 'next/server';
import { parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { createExport } from '@/server/reports/exportService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  // Students export their own evidence; faculty and admin export in scope.
  requireRole(auth, 'student', 'faculty', 'admin');

  await enforceRateLimit('reportExport', auth.userId);

  const input = await parseJson(request, createExportSchema);
  const job = await createExport(auth, input);

  return NextResponse.json({ data: job }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/**
 * Rendering a full cohort package can take a while; raise the ceiling above the
 * platform default so a large export is not cut off mid-render.
 */
export const maxDuration = 300;
