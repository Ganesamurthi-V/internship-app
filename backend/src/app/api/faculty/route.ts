/**
 * GET /api/faculty — list all faculty accounts (admin only).
 *
 * Returns faculty with their assigned department so the admin can see who covers
 * which department and identify gaps.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'admin');

  const faculty = await prisma.user.findMany({
    where: { role: 'faculty', status: 'active' },
    select: {
      id: true,
      email: true,
      name: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });

  return ok(
    faculty.map((f) => ({
      id: f.id,
      email: f.email,
      name: f.name,
      departmentId: f.departmentId,
      departmentName: f.department?.name ?? null,
      createdAt: f.createdAt.toISOString(),
    })),
  );
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
