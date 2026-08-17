/**
 * POST /api/students/:id/approve — faculty approves a pending student profile.
 *
 * Changes the user's status from 'pending' to 'active', allowing them to log in.
 * Only faculty from the same department (or admin) can approve.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { forbidden, conflict, notFound } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);

  const studentId = await uuidRouteParam(context, 'id');

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

  // Faculty can only approve students in their own department
  if (auth.role === 'faculty' && auth.departmentId !== student.departmentId) {
    throw forbidden('You can only approve students in your department.');
  }

  if (student.user.status === 'active') {
    throw conflict('This student is already approved.');
  }

  if (student.user.status === 'suspended') {
    throw conflict('This student account is suspended. Contact an admin.');
  }

  // Approve: set status to active
  await prisma.user.update({
    where: { id: student.user.id },
    data: { status: 'active' },
  });

  await recordAudit({
    action: 'user_status_changed',
    entityType: 'student',
    entityId: studentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { previousStatus: 'pending', newStatus: 'active', studentName: student.name },
  });

  return ok({ message: `${student.name} has been approved and can now log in.`, status: 'active' });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
