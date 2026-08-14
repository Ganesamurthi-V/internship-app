/**
 * GET /api/weekly-reports/current?internshipId= — 05_API_Spec "Weekly Reports".
 *
 * Returns the current week number, its date range, and the pre-aggregated days and
 * hours the form renders as read-only fields (06_App_Flow §5). `reportExists` lets
 * the dashboard decide between "Weekly Report Due" and "Weekly Report Submitted".
 *
 * Route ordering note: this file sits at `weekly-reports/current`, which Next
 * matches ahead of the dynamic `weekly-reports/[id]` segment, so "current" is never
 * mistaken for a report id.
 */

import type { NextRequest } from 'next/server';
import { currentWeekQuerySchema } from '@ims/shared-validation';
import { ok, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { getCurrentWeek } from '@/server/weeklyReports/weeklyReportService';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, currentWeekQuerySchema);

  await assertInternshipAccess(auth, query.internshipId, 'weekly_report', 'read');

  return ok(await getCurrentWeek(query.internshipId));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
