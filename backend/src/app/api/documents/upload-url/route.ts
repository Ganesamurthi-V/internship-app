/**
 * POST /api/documents/upload-url — step 3 of the pipeline in 03_TechSpec §6.
 *
 * Returns a signed URL the client PUTs the file bytes to directly, so no file
 * content passes through this server (07_Security_and_Privacy §4).
 *
 * Rate limited at 30/min per user, the figure given in 07_Security_and_Privacy §6 for
 * upload URL generation. Each call mints a fresh storage key, so an unbounded caller
 * could otherwise reserve keys indefinitely.
 */

import type { NextRequest } from 'next/server';
import type { UploadUrlResponse } from '@ims/shared-types';
import { uploadUrlSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { enforceRateLimit } from '@/lib/rateLimit';
import { requestUploadUrl } from '@/server/documents/documentService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('uploadUrl', auth.userId);

  const input = await parseJson(request, uploadUrlSchema);
  const signed = await requestUploadUrl(auth, input);

  const response: UploadUrlResponse = {
    uploadUrl: signed.uploadUrl,
    storageKey: signed.storageKey,
    expiresIn: signed.expiresIn,
  };

  return ok(response);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
