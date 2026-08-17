/**
 * POST /api/students/:id/reject — faculty rejects a pending student profile.
 *
 * Changes the user's status from 'pending' to 'suspended'. The student cannot
 * log in and sees a message about being rejected.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, parseJson, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { forbidden, conflict, notFound } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';

const rejectSchema = z.object({
  reason: z.string().trim().min(3, { message: 'Provide a reason for rejection.' }).max(500),
});

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);

  const studentId = await uuidRouteParam(context, 'id');
  const input = await parseJson(request, rejectSchema);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      departmentId: true,
      user: { select: { id: true, status: true } },
    },
  });

  if (!student) throw notFound('Student not found.');

  if (auth.role === 'faculty' && auth.departmentId !== student.departmentId) {
    throw forbidden('You can only manage students in your department.');
  }

  if (student.user.status === 'suspended') {
    throw conflict('This student is already rejected.');
  }

  await prisma.user.update({
    where: { id: student.user.id },
    data: { status: 'suspended' },
  });

  await recordAudit({
    action: 'user_status_changed',
    entityType: 'student',
    entityId: studentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { previousStatus: student.user.status, newStatus: 'suspended', reason: input.reason, studentName: student.name },
  });

  return ok({ message: `${student.name} has been rejected.`, status: 'suspended' });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
