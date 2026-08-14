/**
 * POST /api/internships — register an internship (students only)
 * GET  /api/internships — scoped list (faculty/admin/mentor)
 *
 * 05_API_Spec matrix for `/api/internships/:id`: "R own | R assigned | RW scoped |
 * RW". Creation is a student action; the list is always narrowed by
 * `internshipScopeFilter`, so no caller can widen it through query parameters.
 */

import type { NextRequest } from 'next/server';
import { createInternshipSchema, internshipListQuerySchema } from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import {
  buildPagination,
  created,
  listResponse,
  parseJson,
  parseQuery,
  withErrorHandling,
} from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { internshipScopeFilter, requireRole, requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { serializeInternship } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import { createInternship, INTERNSHIP_SELECT } from '@/server/internships/internshipService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);

  await enforceRateLimit('general', auth.userId);

  const input = await parseJson(request, createInternshipSchema);
  const internship = await createInternship(auth, studentId, input);

  await recordAudit({
    action: 'internship_submitted',
    entityType: 'internship',
    entityId: internship.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { stage: 'draft_created', domain: input.domain, mode: input.mode },
  });

  return created(serializeInternship(internship));
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  // Students read their own record through /api/internships/me.
  requireRole(auth, 'faculty', 'admin', 'mentor');

  await enforceRateLimit('general', auth.userId);

  const query = parseQuery(request, internshipListQuerySchema);

  const clauses: Prisma.InternshipWhereInput[] = [
    internshipScopeFilter(auth) as Prisma.InternshipWhereInput,
  ];

  if (query.status) clauses.push({ status: query.status });
  if (query.organisationId) clauses.push({ organisationId: query.organisationId });
  if (query.departmentId) clauses.push({ student: { departmentId: query.departmentId } });
  if (query.facultyCoordinatorId) {
    clauses.push({ facultyCoordinatorId: query.facultyCoordinatorId });
  }
  // A date window matches internships overlapping it, not only those fully inside.
  if (query.from) clauses.push({ endDate: { gte: new Date(query.from) } });
  if (query.to) clauses.push({ startDate: { lte: new Date(query.to) } });

  if (query.search) {
    clauses.push({
      student: {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { registerNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      },
    });
  }

  const where: Prisma.InternshipWhereInput = { AND: clauses };

  const [total, internships] = await Promise.all([
    prisma.internship.count({ where }),
    prisma.internship.findMany({
      where,
      select: {
        ...INTERNSHIP_SELECT,
        student: {
          select: {
            id: true,
            userId: true,
            registerNumber: true,
            name: true,
            programme: true,
            departmentId: true,
            year: true,
            section: true,
            studentEmail: true,
            mobile: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return listResponse(
    // Contact details stay hidden in list views (07_Security_and_Privacy §8).
    internships.map((internship) => serializeInternship(internship)),
    buildPagination(total, query.page, query.pageSize),
  );
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
