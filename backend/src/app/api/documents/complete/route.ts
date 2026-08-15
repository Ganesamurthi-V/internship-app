/**
 * POST /api/documents/complete — confirm an upload landed.
 *
 * Stats the real object and records its true size and MIME type rather than the
 * client's claim. A missing object means the upload never finished, and the
 * reservation is removed so it cannot appear as an unopenable attachment.
 */

import type { NextRequest } from 'next/server';
import { completeUploadSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { enforceRateLimit } from '@/lib/rateLimit';
import { completeUpload } from '@/server/documents/documentService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, completeUploadSchema);

  return ok(await completeUpload(auth, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
