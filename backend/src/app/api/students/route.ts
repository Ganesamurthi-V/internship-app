/**
 * GET /api/students — the reviewer's student directory.
 *
 * Each row carries whether the student submitted today and their running totals,
 * because that is what the reviewer is actually scanning for. Summaries are batched
 * into one query rather than one per row.
 */

import type { NextRequest } from 'next/server';
import { studentListQuerySchema } from '@ims/shared-validation';
import { listResponse, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { listStudents } from '@/server/students/studentService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);
  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, studentListQuerySchema);
  const result = await listStudents(auth, query);

  return listResponse(result.data, result.pagination);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
