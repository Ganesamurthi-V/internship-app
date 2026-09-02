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
import { questionScopeFilter, studentScopeFilter } from '@/lib/auth/guards';
import { getAttendanceSummary } from '@/server/submissions/submissionService';
import { listActiveRetakesForStudent } from '@/server/retakes/retakeService';

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
      workingDays: true,
      createdAt: true,
      updatedAt: true,
      department: { select: { id: true, name: true, institution: true, createdAt: true } },
    },
  });

  if (!student) throw notFound('Student profile not found.');

  const currentDate = today();
  const dateColumn = toDateColumn(currentDate);

  const [todaySubmission, questionCount, summary, recent, retakes] = await Promise.all([
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

    // On the dashboard rather than behind its own call: a grant the student never
    // notices is a grant that expires unused, and the whole point of it is to
    // recover attendance before the deadline.
    listActiveRetakesForStudent(studentId, currentDate),
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
    retakes,
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
  /**
   * The caller's scope, with no account-status filter. This is the cohort behind
   * `totalStudents` and `pendingStudents`, so the header reflects everyone who has
   * registered — a pending registration must be visible, not counted as zero students.
   */
  const scope = studentScopeFilter(auth) as Prisma.StudentWhereInput;

  /**
   * The active subset, which is what the daily counters measure against.
   *
   * Registration creates the Student row before approval, so a pending student cannot
   * sign in or submit. Counting them into "missing today" would report a backlog for
   * people who are not able to answer yet, and would let `submittedToday` be smaller
   * than a total that includes accounts nobody can use.
   */
  const activeScope: Prisma.StudentWhereInput = {
    AND: [scope, { user: { status: 'active' } }],
  };
  const currentDate = today();
  const dateColumn = toDateColumn(currentDate);

  const submissionScope: Prisma.DailySubmissionWhereInput = { student: activeScope };

  const [
    totalStudents,
    activeStudents,
    pendingReview,
    submittedToday,
    approvedToday,
    declinedToday,
    activeQuestions,
  ] = await Promise.all([
    prisma.student.count({ where: scope }),

    prisma.student.count({ where: activeScope }),

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

    // Scoped through questionScopeFilter rather than a local OR on auth.departmentId.
    // An admin's departmentId is normally null, and the local version therefore
    // counted only global questions — reporting zero on an institution that has
    // nothing but department-scoped ones.
    prisma.question.count({
      where: {
        AND: [{ isActive: true }, questionScopeFilter(auth) as Prisma.QuestionWhereInput],
      },
    }),
  ]);

  return {
    pendingReview,
    submittedToday,
    // Measured against the active cohort, not the total: a pending student cannot
    // submit, so counting them here would inflate the backlog. Cannot go negative —
    // every submission counted above belongs to an active student in scope.
    missingToday: Math.max(0, activeStudents - submittedToday),
    approvedToday,
    declinedToday,
    totalStudents,
    activeQuestions,
  };
}
