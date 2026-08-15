/**
 * GET    /api/submissions/:id — full detail, including answers and files
 * DELETE /api/submissions/:id — admin-only cleanup
 */

import type { NextRequest } from 'next/server';
import { noContent, ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertSubmissionAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { deleteSubmission, getSubmissionDetail } from '@/server/submissions/submissionService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const submissionId = await uuidRouteParam(context, 'id');
  // Authorization before the read, so an out-of-scope id never loads.
  await assertSubmissionAccess(auth, submissionId, 'read');

  return ok(await getSubmissionDetail(auth, submissionId));
});

export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const submissionId = await uuidRouteParam(context, 'id');
  await assertSubmissionAccess(auth, submissionId, 'delete');
  await deleteSubmission(auth, submissionId);

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
