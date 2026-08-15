/**
 * GET  /api/departments — list, needed by the student profile form
 * POST /api/departments — admin only (02_SRS §1.5 "Manage ... departments")
 */

import type { NextRequest } from 'next/server';
import { createDepartmentSchema } from '@ims/shared-validation';
import { cachedOk, created, ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { conflict } from '@/lib/errors';
import { isPrismaErrorWithCode, UNIQUE_VIOLATION } from '@/lib/prisma';
import { serializeDepartment } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import { env } from '@/lib/env';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  // Small, bounded reference list — departments change at most once a semester.
  return cachedOk(departments.map(serializeDepartment), 3600);
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'admin');

  const input = await parseJson(request, createDepartmentSchema);

  try {
    const department = await prisma.department.create({
      data: {
        name: input.name,
        institution: input.institution ?? env.INSTITUTION_NAME,
      },
    });

    await recordAudit({
      action: 'settings_changed',
      entityType: 'department',
      entityId: department.id,
      actorUserId: auth.userId,
      context: auth.request,
      metadata: { scope: 'department_created', name: input.name },
    });

    return created(serializeDepartment(department));
  } catch (error) {
    if (isPrismaErrorWithCode(error, UNIQUE_VIOLATION)) {
      throw conflict('That department already exists for this institution.', {
        name: 'Already exists.',
      });
    }
    throw error;
  }
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
