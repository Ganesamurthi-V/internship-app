/**
 * POST /api/documents/:id/verify — faculty only (05_API_Spec).
 *
 * Uses the `verify` access level, which excludes the document's own owner: a student
 * cannot verify their own evidence. Audited at Medium sensitivity
 * (07_Security_and_Privacy §9) and notifies the owner.
 */

import type { NextRequest } from 'next/server';
import { verifyDocumentSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { verifyDocument } from '@/server/documents/documentService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const documentId = await uuidRouteParam(context, 'id');
  const input = await parseJson(request, verifyDocumentSchema.default({}));

  return ok(await verifyDocument(auth, documentId, input.note ?? null));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
