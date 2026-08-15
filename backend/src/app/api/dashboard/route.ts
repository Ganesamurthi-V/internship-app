/**
 * GET /api/dashboard — the caller's home screen, shaped by their role.
 *
 * One endpoint that says which shape it returned, so the client discriminates on
 * `role` rather than needing to know which URL to call before it knows who it is.
 */

import type { NextRequest } from 'next/server';
import type { DashboardResponse } from '@ims/shared-types';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { isStudent, requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getFacultyDashboard, getStudentDashboard } from '@/server/dashboards/dashboardService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  if (isStudent(auth)) {
    const studentId = requireStudentId(auth);
    const payload: DashboardResponse = {
      role: 'student',
      dashboard: await getStudentDashboard(studentId),
    };
    return ok(payload);
  }

  const payload: DashboardResponse = {
    role: auth.role === 'admin' ? 'admin' : 'faculty',
    dashboard: await getFacultyDashboard(auth),
  };
  return ok(payload);
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
