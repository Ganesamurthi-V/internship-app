/**
 * GET   /api/students/me — the signed-in student's profile
 * PATCH /api/students/me — update their own editable fields
 *
 * Keyed off `auth.studentId` rather than an id in the request, which is what makes
 * editing someone else's profile impossible rather than merely guarded.
 */

import type { NextRequest } from 'next/server';
import { updateStudentProfileSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getStudent, updateStudentProfile } from '@/server/students/studentService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);
  await enforceRateLimit('general', auth.userId);

  return ok(await getStudent(auth, studentId));
});

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, updateStudentProfileSchema);

  return ok(await updateStudentProfile(auth, studentId, input));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
