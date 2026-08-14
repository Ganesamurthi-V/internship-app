/**
 * POST /api/weekly-reports/:id/submit — 05_API_Spec "Weekly Reports".
 *
 * Gated on the weekly PDF being uploaded, per 06_App_Flow §5 ("Upload weekly PDF
 * (required for submission)"). The document id may be supplied here or already be
 * attached to the draft; either satisfies the gate.
 *
 * Submission locks the report to the student. Faculty and admin can still correct
 * it, since they are the ones who would request a change.
 */

import type { NextRequest } from 'next/server';
import { submitWeeklyReportSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeWeeklyReport } from '@/lib/serialize';
import { submitWeeklyReport } from '@/server/weeklyReports/weeklyReportService';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const reportId = await uuidRouteParam(context, 'id');

  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { internshipId: true },
  });
  if (!report) throw notFound('Weekly report not found.');

  await assertInternshipAccess(auth, report.internshipId, 'weekly_report', 'write');

  // An empty body is valid: the draft may already carry the document id.
  const input = await parseJson(request, submitWeeklyReportSchema.default({}));

  const submitted = await submitWeeklyReport(auth, reportId, input.reportDocumentId);
  return ok(serializeWeeklyReport(submitted));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
