/**
 * Dashboard aggregates.
 *
 * Each dashboard is one endpoint returning everything its screen needs, rather than
 * the screen making six calls. On mobile that difference is the whole cold-start
 * budget.
 */

import type { Prisma } from '@prisma/client';
import type { FacultyDashboard, StudentDashboard } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn } from '@/lib/clock';
import { notFound } from '@/lib/errors';
import { serializeStudent, serializeSubmission } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { studentScopeFilter } from '@/lib/auth/guards';
import { getAttendanceSummary } from '@/server/submissions/submissionService';

/**
 * The student's home screen: whether today is done, the running totals, and a
 * short history preview.
 */
export async function getStudentDashboard(studentId: string): Promise<StudentDashboard> {
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

  if (!student) throw notFound('Student profile not found.');

  const currentDate = today();
  const dateColumn = toDateColumn(currentDate);

  const [todaySubmission, questionCount, summary, recent] = await Promise.all([
    prisma.dailySubmission.findUnique({
      where: { studentId_submissionDate: { studentId, submissionDate: dateColumn } },
      select: { status: true },
    }),

    prisma.question.count({
      where: {
        isActive: true,
        OR: [
          { departmentId: null },
          ...(student.departmentId ? [{ departmentId: student.departmentId }] : []),
        ],
      },
    }),

    getAttendanceSummary(studentId),

    prisma.dailySubmission.findMany({
      where: { studentId },
      orderBy: { submissionDate: 'desc' },
      take: 7,
      select: {
        id: true,
        studentId: true,
        submissionDate: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    student: serializeStudent(student, { includeContactDetails: true }),
    today: {
      date: currentDate,
      submitted: todaySubmission !== null,
      status: (todaySubmission?.status as StudentDashboard['today']['status']) ?? null,
      questionCount,
    },
    summary,
    recentSubmissions: recent.map(serializeSubmission),
  };
}

/**
 * The reviewer's home screen.
 *
 * `missingToday` is the number that actually drives action, so it is computed as
 * students in scope minus those who submitted, rather than inferred from a count of
 * submissions alone.
 */
export async function getFacultyDashboard(auth: AuthContext): Promise<FacultyDashboard> {
  const scope = studentScopeFilter(auth) as Prisma.StudentWhereInput;
  const currentDate = today();
  const dateColumn = toDateColumn(currentDate);

  const submissionScope: Prisma.DailySubmissionWhereInput = { student: scope };

  const [
    totalStudents,
    pendingReview,
    submittedToday,
    approvedToday,
    declinedToday,
    activeQuestions,
  ] = await Promise.all([
    prisma.student.count({ where: scope }),

    prisma.dailySubmission.count({
      where: { AND: [submissionScope, { status: 'pending' }] },
    }),

    prisma.dailySubmission.count({
      where: { AND: [submissionScope, { submissionDate: dateColumn }] },
    }),

    prisma.dailySubmission.count({
      where: { AND: [submissionScope, { submissionDate: dateColumn }, { status: 'approved' }] },
    }),

    prisma.dailySubmission.count({
      where: { AND: [submissionScope, { submissionDate: dateColumn }, { status: 'declined' }] },
    }),

    prisma.question.count({
      where: {
        isActive: true,
        OR: [
          { departmentId: null },
          ...(auth.departmentId ? [{ departmentId: auth.departmentId }] : []),
        ],
      },
    }),
  ]);

  return {
    pendingReview,
    submittedToday,
    // Cannot go negative: every submission counted above belongs to a student in scope.
    missingToday: Math.max(0, totalStudents - submittedToday),
    approvedToday,
    declinedToday,
    totalStudents,
    activeQuestions,
  };
}
