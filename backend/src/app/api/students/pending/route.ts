/**
 * GET /api/students/pending — list students awaiting approval.
 *
 * Faculty sees only pending students in their department.
 * Admin sees all pending students.
 */

import type { NextRequest } from 'next/server';
import { ok, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireReviewer } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireReviewer(auth);

  // Faculty are strictly scoped to their own department. A faculty account with no
  // department owns no students, so it must match nothing rather than everything —
  // falling through to an unfiltered query would leak every department's students.
  const departmentScope: Prisma.StudentWhereInput =
    auth.role === 'faculty'
      ? { departmentId: auth.departmentId ?? '00000000-0000-0000-0000-000000000000' }
      : {};

  const where: Prisma.StudentWhereInput = {
    user: { status: 'pending' },
    ...departmentScope,
  };

  const students = await prisma.student.findMany({
    where,
    select: {
      id: true,
      registerNumber: true,
      name: true,
      programme: true,
      departmentId: true,
      department: { select: { name: true } },
      year: true,
      section: true,
      studentEmail: true,
      mobile: true,
      organisationName: true,
      organisationLocation: true,
      internshipDomain: true,
      internshipMode: true,
      createdAt: true,
      user: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return ok(students.map((s) => ({
    id: s.id,
    registerNumber: s.registerNumber,
    name: s.name,
    programme: s.programme,
    departmentName: s.department?.name ?? null,
    year: s.year,
    section: s.section,
    email: s.studentEmail,
    mobile: s.mobile,
    organisationName: s.organisationName,
    organisationLocation: s.organisationLocation,
    internshipDomain: s.internshipDomain,
    internshipMode: s.internshipMode,
    status: s.user.status,
    createdAt: s.createdAt.toISOString(),
  })));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
