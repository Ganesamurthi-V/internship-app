/**
 * GET /api/dashboard — the caller's dashboard, chosen by role.
 *
 * One endpoint rather than three, because 06_App_Flow §2 routes by role immediately
 * after login and the app should not have to know which URL its role maps to. The
 * response is discriminated by `role` so the client can narrow the payload type.
 *
 * Not named in 05_API_Spec, but 08_Implementation_Plan Phase 2 step 7 ("Student
 * dashboard data endpoint") and Phase 6 step 1 ("Faculty dashboard data endpoint")
 * both require it.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { forbidden } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
  getFacultyDashboard,
  getMentorDashboard,
  getStudentDashboard,
} from '@/server/dashboards/dashboardService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  switch (auth.role) {
    case 'student': {
      if (!auth.studentId) throw forbidden('This account has no student profile.');
      return ok({ role: 'student', dashboard: await getStudentDashboard(auth.studentId) });
    }

    case 'mentor': {
      if (!auth.mentorId) throw forbidden('This account has no mentor profile.');
      return ok({ role: 'mentor', dashboard: await getMentorDashboard(auth.mentorId) });
    }

    case 'faculty':
    case 'admin':
      // Admins get the same shape, unscoped — `internshipScopeFilter` returns an
      // empty filter for them.
      return ok({ role: auth.role, dashboard: await getFacultyDashboard(auth) });

    default:
      throw forbidden('No dashboard is available for this account.');
  }
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
