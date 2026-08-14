/**
 * POST /api/work-logs — submit a day's work log (student)
 * GET  /api/work-logs?internshipId=&from=&to=&search= — list
 *
 * 05_API_Spec matrix: "RW own | R assigned | RW scoped | RW".
 *
 * The `search` parameter covers activities, learning and technology tags, which is
 * the "searchable by date, tech, keyword" requirement in 02_SRS §7. The trigram and
 * GIN indexes added in the constraints migration are what keep it from becoming a
 * sequential scan.
 */

import type { NextRequest } from 'next/server';
import { createWorkLogSchema, workLogListQuerySchema } from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import { created, ok, parseJson, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertInternshipAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { dateRangeFilter } from '@/lib/clock';
import { serializeWorkLog } from '@/lib/serialize';
import { upsertWorkLog, WORK_LOG_SELECT } from '@/server/workLogs/workLogService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, createWorkLogSchema);
  await assertInternshipAccess(auth, input.internshipId, 'work_log', 'write');

  const result = await upsertWorkLog(auth, input);
  const payload = serializeWorkLog(result.record);

  return result.status === 'created' ? created(payload) : ok(payload);
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const query = parseQuery(request, workLogListQuerySchema);

  await assertInternshipAccess(auth, query.internshipId, 'work_log', 'read');

  const dateFilter = dateRangeFilter(query.from, query.to);

  const clauses: Prisma.DailyWorkLogWhereInput[] = [{ internshipId: query.internshipId }];
  if (dateFilter) clauses.push({ workDate: dateFilter });

  if (query.search) {
    clauses.push({
      OR: [
        { activities: { contains: query.search, mode: 'insensitive' } },
        { learning: { contains: query.search, mode: 'insensitive' } },
        { taskAssigned: { contains: query.search, mode: 'insensitive' } },
        // Postgres array containment: matches an exact tag, case-sensitively, which
        // is correct because tags are stored as the student first spelled them.
        { technologies: { has: query.search } },
      ],
    });
  }

  const records = await prisma.dailyWorkLog.findMany({
    where: { AND: clauses },
    orderBy: { workDate: 'desc' },
    select: WORK_LOG_SELECT,
  });

  return ok(records.map(serializeWorkLog));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
