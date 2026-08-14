/**
 * GET  /api/students/me — the signed-in student's profile
 * PATCH /api/students/me — edit it
 *
 * 05_API_Spec authorization matrix: `/api/students/me` is "RW" for students and
 * unavailable to every other role, which is exactly what `requireStudentId`
 * enforces.
 *
 * The register number is not editable — it is the master key for the student
 * record (01_PRD §1), and `updateStudentProfileSchema` omits it rather than
 * silently ignoring it.
 */

import type { NextRequest } from 'next/server';
import { updateStudentProfileSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireStudentId } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { notFound, validationError } from '@/lib/errors';
import { serializeStudent } from '@/lib/serialize';
import { buildDiff, recordAudit } from '@/lib/audit';

const STUDENT_SELECT = {
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
} as const;

export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: STUDENT_SELECT,
  });

  if (!student) throw notFound('Student profile not found.');

  // The owner sees their own contact details.
  return ok(serializeStudent(student, { includeContactDetails: true }));
});

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const studentId = requireStudentId(auth);

  const input = await parseJson(request, updateStudentProfileSchema);

  const before = await prisma.student.findUnique({
    where: { id: studentId },
    select: STUDENT_SELECT,
  });
  if (!before) throw notFound('Student profile not found.');

  // Verify the department exists before assigning it, so a bad id produces a field
  // error rather than a foreign key violation surfaced as a 500.
  if (input.departmentId) {
    const department = await prisma.department.count({ where: { id: input.departmentId } });
    if (department === 0) {
      throw validationError('That department does not exist.', {
        departmentId: 'Unknown department.',
      });
    }
  }

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.programme !== undefined ? { programme: input.programme } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.studentEmail !== undefined ? { studentEmail: input.studentEmail } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
    },
    select: STUDENT_SELECT,
  });

  await recordAudit({
    action: 'settings_changed',
    entityType: 'student',
    entityId: studentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      scope: 'own_profile',
      // Contact details are recorded as changed without echoing the values.
      changes: buildDiff(before, updated, { redact: ['mobile', 'studentEmail'] }),
    },
  });

  return ok(serializeStudent(updated, { includeContactDetails: true }));
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
