/**
 * Student directory and profile.
 *
 * The list is the reviewer's main navigation surface: who submitted today, who did
 * not, and how each is tracking overall. The summaries are batched into one query
 * rather than one per row, because a department list of 60 students would otherwise
 * be 61 queries.
 */

import type { Prisma } from '@prisma/client';
import type { Pagination, Student, StudentListItem, SubmissionStatus } from '@ims/shared-types';
import type { StudentListQueryInput, UpdateStudentProfileInput } from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn } from '@/lib/clock';
import { notFound } from '@/lib/errors';
import { serializeStudent } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/context';
import { canSeeContactDetails, studentScopeFilter } from '@/lib/auth/guards';
import { getAttendanceSummaries, getAttendanceSummary } from '@/server/submissions/submissionService';

const studentSelect = {
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
} satisfies Prisma.StudentSelect;

export async function getStudent(auth: AuthContext, studentId: string): Promise<Student> {
  const row = await prisma.student.findUnique({
    where: { id: studentId },
    select: studentSelect,
  });

  if (!row) throw notFound('Student not found.');

  return serializeStudent(row, {
    includeContactDetails: canSeeContactDetails(auth, studentId),
  });
}

export async function listStudents(
  auth: AuthContext,
  query: StudentListQueryInput,
): Promise<{ data: StudentListItem[]; pagination: Pagination }> {
  const scope = studentScopeFilter(auth) as Prisma.StudentWhereInput;
  const currentDate = today();
  const dateColumn = toDateColumn(currentDate);

  const where: Prisma.StudentWhereInput = {
    AND: [
      scope,
      ...(query.departmentId ? [{ departmentId: query.departmentId }] : []),
      ...(query.year !== undefined ? [{ year: query.year }] : []),
      ...(query.section ? [{ section: query.section }] : []),
      ...(query.search
        ? [
            {
              OR: [
                // Register numbers are stored uppercase, so match that way rather
                // than relying on a case-insensitive scan.
                { registerNumber: { contains: query.search.toUpperCase() } },
                { name: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      ...(query.submittedToday !== undefined
        ? [
            query.submittedToday
              ? { submissions: { some: { submissionDate: dateColumn } } }
              : { submissions: { none: { submissionDate: dateColumn } } },
          ]
        : []),
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: [{ registerNumber: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        registerNumber: true,
        name: true,
        programme: true,
        year: true,
        section: true,
        department: { select: { name: true } },
        submissions: {
          where: { submissionDate: dateColumn },
          select: { status: true },
          take: 1,
        },
      },
    }),
  ]);

  // One batched query for every summary on the page.
  const summaries = await getAttendanceSummaries(rows.map((row) => row.id));

  const data: StudentListItem[] = rows.map((row) => {
    const todayEntry = row.submissions[0];
    return {
      id: row.id,
      registerNumber: row.registerNumber,
      name: row.name,
      programme: row.programme,
      departmentName: row.department?.name ?? null,
      year: row.year,
      section: row.section,
      submittedToday: todayEntry !== undefined,
      todayStatus: (todayEntry?.status as SubmissionStatus | undefined) ?? null,
      summary: summaries.get(row.id) ?? {
        daysApproved: 0,
        daysPending: 0,
        daysDeclined: 0,
        daysSubmitted: 0,
        approvalPercentage: null,
        firstSubmissionDate: null,
        lastSubmissionDate: null,
      },
    };
  });

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 0,
    },
  };
}

export async function updateStudentProfile(
  auth: AuthContext,
  studentId: string,
  input: UpdateStudentProfileInput,
): Promise<Student> {
  const existing = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!existing) throw notFound('Student not found.');

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.programme !== undefined ? { programme: input.programme } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.studentEmail !== undefined ? { studentEmail: input.studentEmail } : {}),
    },
    select: studentSelect,
  });

  await recordAudit({
    action: 'student_profile_updated',
    entityType: 'student',
    entityId: studentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { changed: Object.keys(input) },
  });

  return serializeStudent(updated, {
    includeContactDetails: canSeeContactDetails(auth, studentId),
  });
}

/** Re-exported so routes have one import for student-scoped reads. */
export { getAttendanceSummary };
