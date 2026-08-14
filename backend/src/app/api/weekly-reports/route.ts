/**
 * POST /api/weekly-reports — create or open the draft for a week
 * GET  /api/weekly-reports?internshipId= — the report timeline
 *
 * 05_API_Spec matrix: "RW own | R assigned | RW scoped | RW".
 *
 * POST is idempotent per week: if a draft already exists it is updated rather than
 * rejected, because the app navigates to `weekly-report/[week]` and needs a record
 * to edit either way.
 */

import type { NextRequest } from 'next/server';
import {
  createWeeklyReportSchema,
  weeklyReportListQuerySchema,
} from '@ims/shared-validation';
import { created, ok, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { serializeWeeklyReport } from '@/lib/serialize';
import {
  createOrGetWeeklyReport,
  WEEKLY_REPORT_SELECT,
} from '@/server/weeklyReports/weeklyReportService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, createWeeklyReportSchema);
  await assertInternshipAccess(auth, input.internshipId, 'weekly_report', 'write');

  const report = await createOrGetWeeklyReport(auth, input);
  return created(serializeWeeklyReport(report));
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, weeklyReportListQuerySchema);

  await assertInternshipAccess(auth, query.internshipId, 'weekly_report', 'read');

  const reports = await prisma.weeklyReport.findMany({
    where: { internshipId: query.internshipId },
    // Ascending: the timeline view in 12_Mobile_App_Spec §2 reads week 1 downward.
    orderBy: { weekNumber: 'asc' },
    select: WEEKLY_REPORT_SELECT,
  });

  return ok(reports.map(serializeWeeklyReport));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
