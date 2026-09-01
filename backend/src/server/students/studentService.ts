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
import { emptyAttendanceSummary } from '@ims/shared-validation';
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
  // Selected even though the other internship fields are not, because attendance is
  // measured against it and every screen showing a percentage also explains the week
  // it was measured over.
  workingDays: true,
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
                // Department is matched by name because that is what the reviewer
                // sees on the row; departmentId stays available as an exact filter.
                {
                  department: {
                    name: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
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
      // Uses the shared helper rather than an inline literal so a new field on
      // AttendanceSummary cannot be forgotten here.
      summary: summaries.get(row.id) ?? emptyAttendanceSummary(),
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
      ...(input.mobile !== undefined && input.mobile !== null ? { mobile: input.mobile } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.studentEmail !== undefined ? { studentEmail: input.studentEmail } : {}),
      // Included because the schema accepts it: a field that validates and is then
      // dropped is worse than one that is rejected, since the caller is told it worked.
      // Changing this retroactively re-scores the student's whole attendance history,
      // which is intended — a placement that was always six days should be measured
      // that way — and is why the audit entry below records the change.
      ...(input.workingDays !== undefined ? { workingDays: input.workingDays } : {}),
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
