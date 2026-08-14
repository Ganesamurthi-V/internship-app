/**
 * POST /api/documents/complete — step 6 of the pipeline in 03_TechSpec §6.
 *
 * Confirms the upload landed and records metadata. The service verifies that the
 * storage key was issued to this caller and reads the object's real size and MIME
 * type from storage rather than trusting the request body.
 */

import type { NextRequest } from 'next/server';
import { completeUploadSchema } from '@ims/shared-validation';
import { created, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { enforceRateLimit } from '@/lib/rateLimit';
import { completeUpload } from '@/server/documents/documentService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('uploadUrl', auth.userId);

  const input = await parseJson(request, completeUploadSchema);
  const document = await completeUpload(auth, input);

  return created(document);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
