/**
 * GET  /api/mentors — scoped mentor list (faculty/admin)
 * POST /api/mentors — create a mentor record (faculty/admin)
 *
 * Mentors are usually created implicitly during registration, from the details the
 * student types (see `resolveMentor` in internshipService). These endpoints exist
 * for the admin management screen in 06_App_Flow §1 and for faculty correcting a
 * mentor's details before sending an invite.
 *
 * The invite token is never returned — `serializeMentor` reports only
 * `hasPendingInvite` and `inviteExpires`.
 */

import type { NextRequest } from 'next/server';
import { createMentorSchema, paginationQuerySchema } from '@ims/shared-validation';
import { z } from 'zod';
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
import { isAdmin, requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { serializeMentor } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';

const MENTOR_SELECT = {
  id: true,
  userId: true,
  name: true,
  designation: true,
  email: true,
  contact: true,
  organisationId: true,
  inviteToken: true,
  inviteExpires: true,
  createdAt: true,
  updatedAt: true,
  organisation: {
    select: { id: true, name: true, location: true, createdAt: true, updatedAt: true },
  },
} as const;

const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  organisationId: z.string().uuid().optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const query = parseQuery(request, listQuerySchema);

  const clauses: Prisma.MentorWhereInput[] = [];

  // Faculty see mentors attached to internships within their scope; admins see all.
  if (!isAdmin(auth)) {
    const scopeClauses: Prisma.InternshipWhereInput[] = [
      { facultyCoordinatorId: auth.userId },
    ];
    if (auth.departmentId) {
      scopeClauses.push({ student: { departmentId: auth.departmentId } });
    }
    clauses.push({ internships: { some: { OR: scopeClauses } } });
  }

  if (query.organisationId) clauses.push({ organisationId: query.organisationId });
  if (query.search) {
    clauses.push({
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.MentorWhereInput = clauses.length > 0 ? { AND: clauses } : {};

  const [total, mentors] = await Promise.all([
    prisma.mentor.count({ where }),
    prisma.mentor.findMany({
      where,
      select: MENTOR_SELECT,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return listResponse(
    mentors.map(serializeMentor),
    buildPagination(total, query.page, query.pageSize),
  );
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'faculty', 'admin');

  const input = await parseJson(request, createMentorSchema);

  const mentor = await prisma.mentor.create({
    data: {
      name: input.name,
      designation: input.designation ?? null,
      email: input.email ?? null,
      contact: input.contact ?? null,
      organisationId: input.organisationId ?? null,
    },
    select: MENTOR_SELECT,
  });

  await recordAudit({
    action: 'settings_changed',
    entityType: 'mentor',
    entityId: mentor.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { scope: 'mentor_created' },
  });

  return created(serializeMentor(mentor));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
