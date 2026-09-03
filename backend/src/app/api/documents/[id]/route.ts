/**
 * GET    /api/documents/:id — mint a short-lived signed download URL
 * DELETE /api/documents/:id — soft-delete the row, then remove the object
 *
 * The download returns JSON containing the URL rather than a 302. The mobile client
 * needs the filename and size alongside it, and a redirect would strip the
 * Authorization header on the follow-up request anyway. Pass `?redirect=1` when a
 * plain browser redirect is wanted.
 *
 * Pass `?inline=1` for a preview URL — one without the Content-Disposition attachment
 * header, so a viewer renders the file instead of saving it. The flag is a request, not
 * a guarantee: it is ignored for types that are not safe to render in place.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { noContent, ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertDocumentAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { deleteDocument, getDownloadUrl } from '@/server/documents/documentService';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const documentId = await uuidRouteParam(context, 'id');
  await assertDocumentAccess(auth, documentId, 'read');

  const result = await getDownloadUrl(auth, documentId, {
    inline: request.nextUrl.searchParams.get('inline') === '1',
  });

  if (request.nextUrl.searchParams.get('redirect') === '1') {
    return NextResponse.redirect(result.downloadUrl, { status: 302 });
  }

  return ok(result);
});

export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const documentId = await uuidRouteParam(context, 'id');
  const document = await assertDocumentAccess(auth, documentId, 'delete');

  await deleteDocument(auth, documentId, document.storageKey);

  return noContent();
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
