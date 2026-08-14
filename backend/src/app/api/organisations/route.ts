/**
 * GET  /api/organisations — list, used by the registration wizard's picker
 * POST /api/organisations — admin only (02_SRS §1.5 "Manage ... organisations")
 *
 * The list is readable by any signed-in user because a student needs it to fill in
 * step 1 of registration (06_App_Flow §3). It contains no personal data — only
 * company names and locations.
 */

import type { NextRequest } from 'next/server';
import { createOrganisationSchema, paginationQuerySchema } from '@ims/shared-validation';
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
import { requireRole } from '@/lib/auth/guards';
import { isPrismaErrorWithCode, prisma, UNIQUE_VIOLATION } from '@/lib/prisma';
import { conflict } from '@/lib/errors';
import { serializeOrganisation } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';

const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);
  const query = parseQuery(request, listQuerySchema);

  const where: Prisma.OrganisationWhereInput = query.search
    ? { name: { contains: query.search, mode: 'insensitive' } }
    : {};

  const [total, organisations] = await Promise.all([
    prisma.organisation.count({ where }),
    prisma.organisation.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return listResponse(
    organisations.map(serializeOrganisation),
    buildPagination(total, query.page, query.pageSize),
  );
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'admin');

  const input = await parseJson(request, createOrganisationSchema);

  try {
    const organisation = await prisma.organisation.create({
      data: { name: input.name, location: input.location ?? null },
    });

    await recordAudit({
      action: 'settings_changed',
      entityType: 'organisation',
      entityId: organisation.id,
      actorUserId: auth.userId,
      context: auth.request,
      metadata: { scope: 'organisation_created', name: input.name },
    });

    return created(serializeOrganisation(organisation));
  } catch (error) {
    // Organisations are unique by name so registration can upsert against them.
    if (isPrismaErrorWithCode(error, UNIQUE_VIOLATION)) {
      throw conflict('An organisation with that name already exists.', {
        name: 'Already exists.',
      });
    }
    throw error;
  }
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
