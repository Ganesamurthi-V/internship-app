/**
 * GET /api/documents — the caller's files that are not yet attached to a submission.
 *
 * The staging list for the daily form: a student picks files, they land here, and
 * `POST /api/submissions` attaches them. Files already attached are read through the
 * submission that owns them.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { listUnattached } from '@/server/documents/documentService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireStudentId(auth);
  await enforceRateLimit('general', auth.userId);

  return ok(await listUnattached(auth));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
