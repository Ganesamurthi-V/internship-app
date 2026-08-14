/**
 * GET /api/students/:id — faculty and admin only (05_API_Spec "Students").
 *
 * Matrix row: "— | — | R | RW". Faculty reads are department-scoped by
 * `assertStudentAccess`, which satisfies the 09_Test_Plan §3 case "Faculty cannot
 * access records outside their department scope".
 *
 * The mobile number is withheld from faculty per 07_Security_and_Privacy §8
 * ("Faculty sees student name/register number — not mobile number unless needed"),
 * which `canSeeContactDetails` decides.
 */

import type { NextRequest } from 'next/server';
import { ok, uuidRouteParam, withErrorHandling, type RouteContext } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertStudentAccess, canSeeContactDetails, requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { serializeStudent } from '@/lib/serialize';

export const GET = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireAuth(request);
  const studentId = await uuidRouteParam(context, 'id');

  // Students use /api/students/me; mentors have no row in this matrix entry.
  requireRole(auth, 'faculty', 'admin');
  await assertStudentAccess(auth, studentId, 'read');

  const student = await prisma.student.findUnique({
    where: { id: studentId },
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
      department: { select: { id: true, name: true, institution: true, createdAt: true } },
    },
  });

  if (!student) throw notFound('Student not found.');

  return ok(
    serializeStudent(student, {
      includeContactDetails: canSeeContactDetails(auth, studentId),
    }),
  );
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
