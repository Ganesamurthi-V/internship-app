/**
 * GET   /api/weekly-reports/:id
 * PATCH /api/weekly-reports/:id
 *
 * Every write re-aggregates days and hours from attendance, so a report drafted on
 * Wednesday and edited on Sunday reflects the full week without the student
 * touching those numbers (02_SRS §2.4).
 */

import type { NextRequest } from 'next/server';
import { updateWeeklyReportSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeWeeklyReport } from '@/lib/serialize';
import {
  updateWeeklyReport,
  WEEKLY_REPORT_SELECT,
} from '@/server/weeklyReports/weeklyReportService';

async function loadOwningInternshipId(reportId: string): Promise<string> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { internshipId: true },
  });
  if (!report) throw notFound('Weekly report not found.');
  return report.internshipId;
}

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const reportId = await uuidRouteParam(context, 'id');

  const internshipId = await loadOwningInternshipId(reportId);
  await assertInternshipAccess(auth, internshipId, 'weekly_report', 'read');

  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: WEEKLY_REPORT_SELECT,
  });
  if (!report) throw notFound('Weekly report not found.');

  return ok(serializeWeeklyReport(report));
});

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const reportId = await uuidRouteParam(context, 'id');

  const internshipId = await loadOwningInternshipId(reportId);
  await assertInternshipAccess(auth, internshipId, 'weekly_report', 'write');

  const input = await parseJson(request, updateWeeklyReportSchema);
  const report = await updateWeeklyReport(auth, reportId, input);

  return ok(serializeWeeklyReport(report));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
