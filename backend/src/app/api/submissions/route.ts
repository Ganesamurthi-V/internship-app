/**
 * GET  /api/submissions — the review queue, or a student's own history
 * POST /api/submissions — a student submits (or resubmits) a day's answers
 *
 * Both are scoped by `submissionScopeFilter`, so a student sees only their own rows
 * and faculty only their department's, without either having to pass a filter.
 */

import type { NextRequest } from 'next/server';
import { submissionListQuerySchema, submitAnswersSchema } from '@ims/shared-validation';
import { created, listResponse, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { listSubmissions, submitAnswers } from '@/server/submissions/submissionService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, submissionListQuerySchema);
  const result = await listSubmissions(auth, query);

  return listResponse(result.data, result.pagination);
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  // Students only — the guard matrix makes submission writes owner-exclusive, so
  // there is no reviewer path into this handler at all.
  const studentId = requireStudentId(auth);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, submitAnswersSchema);

  return created(await submitAnswers(auth, studentId, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
