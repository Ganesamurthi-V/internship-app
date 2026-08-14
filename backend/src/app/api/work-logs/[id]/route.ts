/**
 * GET   /api/work-logs/:id
 * PATCH /api/work-logs/:id
 *
 * Authorization is resolved from the record's internship, so a student cannot read
 * or edit another student's log by guessing an id (09_Test_Plan §3).
 */

import type { NextRequest } from 'next/server';
import { updateWorkLogSchema } from '@ims/shared-validation';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeWorkLog } from '@/lib/serialize';
import { updateWorkLog, WORK_LOG_SELECT } from '@/server/workLogs/workLogService';

async function loadOwningInternshipId(workLogId: string): Promise<string> {
  const record = await prisma.dailyWorkLog.findUnique({
    where: { id: workLogId },
    select: { internshipId: true },
  });
  if (!record) throw notFound('Work log not found.');
  return record.internshipId;
}

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const workLogId = await uuidRouteParam(context, 'id');

  const internshipId = await loadOwningInternshipId(workLogId);
  await assertInternshipAccess(auth, internshipId, 'work_log', 'read');

  const record = await prisma.dailyWorkLog.findUnique({
    where: { id: workLogId },
    select: WORK_LOG_SELECT,
  });
  if (!record) throw notFound('Work log not found.');

  return ok(serializeWorkLog(record));
});

export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const workLogId = await uuidRouteParam(context, 'id');

  const internshipId = await loadOwningInternshipId(workLogId);
  await assertInternshipAccess(auth, internshipId, 'work_log', 'write');

  const input = await parseJson(request, updateWorkLogSchema);
  const record = await updateWorkLog(auth, workLogId, input);

  return ok(serializeWorkLog(record));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
