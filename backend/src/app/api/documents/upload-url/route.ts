/**
 * POST /api/documents/upload-url — reserve a document row and get a signed PUT URL.
 *
 * The client uploads bytes straight to Storage, so no file content passes through
 * this server. Rate-limited separately from general traffic because issuing URLs is
 * cheap for a client and not free for us.
 */

import type { NextRequest } from 'next/server';
import { uploadUrlSchema } from '@ims/shared-validation';
import { created, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { enforceRateLimit } from '@/lib/rateLimit';
import { issueUploadUrl } from '@/server/documents/documentService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  // Both students (attaching to submissions) and faculty (attaching reference docs
  // to questions) may upload files.
  await enforceRateLimit('uploadUrl', auth.userId);

  const input = await parseJson(request, uploadUrlSchema);

  return created(await issueUploadUrl(auth, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
