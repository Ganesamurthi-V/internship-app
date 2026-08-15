/**
 * GET /api/submissions/today — the student's daily form.
 *
 * One call returns the questions, the existing submission if any, and whether the
 * form still accepts a write. `?date=YYYY-MM-DD` lets a student look back at a past
 * day; the server still decides whether that day is writable, so a device with a
 * wrong clock cannot reopen a closed one.
 */

import type { NextRequest } from 'next/server';
import { todayQuerySchema } from '@ims/shared-validation';
import { ok, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getTodayForm } from '@/server/submissions/submissionService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);
  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, todayQuerySchema);

  return ok(await getTodayForm(auth, studentId, query.date));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
