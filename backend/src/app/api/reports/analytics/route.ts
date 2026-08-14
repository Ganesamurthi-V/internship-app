/**
 * GET /api/reports/analytics — cohort statistics for the faculty/admin dashboards.
 *
 * Backs the aggregate figures in 02_SRS §7 (skill and mentor rating averages,
 * technology usage, completion breakdown, organisation- and department-wise
 * statistics) and sections D–E of the NBA package in 06_App_Flow §8.
 *
 * The caller's scope filter is always the first clause, so the `departmentId` and
 * `organisationId` parameters can only narrow what they already see.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { dateOnlySchema, uuidSchema } from '@ims/shared-validation';
import { ok, parseQuery, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { internshipScopeFilter, requireRole } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { buildCohortAnalytics } from '@/server/reports/evidenceService';

const querySchema = z.object({
  departmentId: uuidSchema.optional(),
  organisationId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, querySchema);

  const clauses: Prisma.InternshipWhereInput[] = [
    internshipScopeFilter(auth) as Prisma.InternshipWhereInput,
  ];

  if (query.departmentId) clauses.push({ student: { departmentId: query.departmentId } });
  if (query.organisationId) clauses.push({ organisationId: query.organisationId });
  // A date window selects internships overlapping it, not only those fully inside.
  if (query.from) clauses.push({ endDate: { gte: new Date(query.from) } });
  if (query.to) clauses.push({ startDate: { lte: new Date(query.to) } });

  return ok(await buildCohortAnalytics({ AND: clauses }));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
