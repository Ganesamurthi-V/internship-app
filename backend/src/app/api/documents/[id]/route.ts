/**
 * GET    /api/documents/:id — issue a short-lived download URL
 * DELETE /api/documents/:id — soft delete, then remove the object
 *
 * 05_API_Spec describes the GET as "returns presigned GET URL (redirect)". This
 * returns JSON by default and redirects only when `?redirect=1` is passed.
 *
 * Reason for the deviation: a 302 to a signed URL is convenient for a browser but
 * awkward for the mobile client, which needs the document metadata alongside the URL
 * and would have to follow (or suppress) the redirect to get it. Both behaviours are
 * available, so a browser-based faculty portal can still link straight to the file.
 *
 * Either way the URL carries the 15-minute TTL from 07_Security_and_Privacy §4, and
 * the response is `no-store` so no proxy retains it.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { DocumentDownloadResponse } from '@ims/shared-types';
import { noContent, ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { deleteDocument, getDocumentDownload } from '@/server/documents/documentService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const documentId = await uuidRouteParam(context, 'id');

  const result = await getDocumentDownload(auth, documentId);

  if (request.nextUrl.searchParams.get('redirect') === '1') {
    // 307 rather than 302: preserves the method and signals the target is temporary,
    // which matters because the signed URL expires.
    return NextResponse.redirect(result.downloadUrl, {
      status: 307,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const response: DocumentDownloadResponse = {
    downloadUrl: result.downloadUrl,
    expiresIn: result.expiresIn,
    document: result.document,
  };

  return ok(response);
});

export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const documentId = await uuidRouteParam(context, 'id');

  await deleteDocument(auth, documentId);
  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
