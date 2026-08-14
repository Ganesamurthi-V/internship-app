/**
 * POST /api/documents/:id/reject — faculty only (05_API_Spec).
 *
 * A reason is mandatory (minimum 10 characters): the student receives a push
 * notification and needs to know what to fix (02_SRS §4, 06_App_Flow). The database
 * CHECK constraint `documents_rejection_reason_present` enforces the same rule.
 */

import type { NextRequest } from 'next/server';
import { rejectDocumentSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { rejectDocument } from '@/server/documents/documentService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const documentId = await uuidRouteParam(context, 'id');
  const input = await parseJson(request, rejectDocumentSchema);

  return ok(await rejectDocument(auth, documentId, input.rejectionReason));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
