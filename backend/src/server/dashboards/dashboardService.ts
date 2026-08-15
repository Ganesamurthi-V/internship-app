/**
 * Dashboard aggregates — 06_App_Flow §4 (student) and §7 (faculty).
 *
 * Each dashboard is one endpoint returning everything the screen needs, rather than
 * the screen making six calls. That matters on mobile: 03_TechSpec §8 targets a
 * two-second cold start on a mid-range Android, and six sequential round trips over
 * 4G will not fit in that budget.
 */

import type {
  FacultyDashboard,
  MentorDashboard,
  StudentDashboard,
} from '@ims/shared-types';
import {
  calculateInternshipDuration,
  calculateWeekNumber,
  calculateWeekRange,
  countInternshipWeeks,
  daysBetween,
  isFinalAssessmentUnlocked,
} from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import { NOTIFICATION_DEFAULTS } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn } from '@/lib/clock';
import { notFound } from '@/lib/errors';
import { serializeInternship, serializeStudent, toDateOnly } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { internshipScopeFilter } from '@/lib/auth/guards';
import { getAttendanceSummary, getAttendanceSummaries } from '@/server/attendance/summaryService';

/**
 * Student dashboard: today's checklist, internship summary, and the cards for the
 * weekly report and final assessment (06_App_Flow §4).
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

  // Parallelize: internship lookup and notification count both depend on the student
  // but not on each other. This saves one DB round-trip.
  const [internship, unreadNotificationCount] = await Promise.all([
    prisma.internship.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        studentId: true,
        organisationId: true,
        mentorId: true,
        facultyCoordinatorId: true,
        domain: true,
        mode: true,
        startDate: true,
        endDate: true,
        durationDays: true,
        workingHoursPerDay: true,
        status: true,
        approvedById: true,
        approvedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        organisation: {
          select: { id: true, name: true, location: true, createdAt: true, updatedAt: true },
        },
        finalAssessment: { select: { submittedAt: true, facultyUnlockedAt: true } },
      },
    }),
    prisma.notificationLog.count({
      where: { userId: student.userId, readAt: null },
    }),
  ]);

  const currentDate = today();

  if (!internship) {
    // First-run state: no internship yet, so the dashboard renders the
    // "Register Internship" call to action (06_App_Flow §3).
    return {
      student: serializeStudent(student, { includeContactDetails: true }),
      internship: null,
      duration: null,
      attendanceSummary: null,
      today: { date: currentDate, attendanceSubmitted: false, workLogSubmitted: false },
      currentWeek: null,
      finalAssessment: null,
      pendingDocumentCount: 0,
      unreadNotificationCount,
    };
  }

  const startDate = toDateOnly(internship.startDate);
  const endDate = toDateOnly(internship.endDate);
  const dateColumn = toDateColumn(currentDate);

  const [attendanceToday, workLogToday, attendanceSummary, pendingDocumentCount, currentWeek] =
    await Promise.all([
      prisma.attendance.findFirst({
        where: { internshipId: internship.id, attendanceDate: dateColumn },
        select: { id: true },
      }),
      prisma.dailyWorkLog.findFirst({
        where: { internshipId: internship.id, workDate: dateColumn },
        select: { id: true },
      }),
      getAttendanceSummary(internship.id),
      prisma.document.count({
        where: {
          internshipId: internship.id,
          verificationStatus: 'pending',
          deletedAt: null,
        },
      }),
      resolveCurrentWeekCard(internship.id, startDate, endDate, currentDate),
    ]);

  const facultyUnlocked = internship.finalAssessment?.facultyUnlockedAt !== null &&
    internship.finalAssessment?.facultyUnlockedAt !== undefined;

  const daysToEnd = daysBetween(currentDate, endDate);

  return {
    student: serializeStudent(student, { includeContactDetails: true }),
    internship: serializeInternship(internship),
    duration: calculateInternshipDuration(startDate, endDate),
    attendanceSummary,
    today: {
      date: currentDate,
      attendanceSubmitted: attendanceToday !== null,
      workLogSubmitted: workLogToday !== null,
    },
    currentWeek,
    finalAssessment: {
      unlocked: isFinalAssessmentUnlocked({ endDate, today: currentDate, facultyUnlocked }),
      submitted: internship.finalAssessment?.submittedAt != null,
      // Only meaningful while the internship is still running.
      dueInDays: daysToEnd >= 0 ? daysToEnd : null,
    },
    pendingDocumentCount,
    unreadNotificationCount,
  };
}

/**
 * The weekly report card.
 *
 * `dueSoon` turns on from the configured reminder day of the week onward
 * (Sunday by default, 02_SRS §4), which is when 06_App_Flow §5 shows the
 * "Weekly Report Due" card.
 */
async function resolveCurrentWeekCard(
  internshipId: string,
  startDate: string,
  endDate: string,
  currentDate: string,
): Promise<StudentDashboard['currentWeek']> {
  const totalWeeks = countInternshipWeeks(startDate, endDate);
  if (totalWeeks === 0) return null;

  const rawWeek = calculateWeekNumber(startDate, currentDate);
  const weekNumber = Math.min(Math.max(rawWeek ?? 1, 1), totalWeeks);
  const range = calculateWeekRange(startDate, endDate, weekNumber);

  const report = await prisma.weeklyReport.findUnique({
    where: { internshipId_weekNumber: { internshipId, weekNumber } },
    select: { submittedAt: true },
  });

  const daysToWeekEnd = daysBetween(currentDate, range.weekEndDate);
  const reminderDay = NOTIFICATION_DEFAULTS.weeklyReportReminderDay;
  const currentDay = new Date(`${currentDate}T00:00:00Z`).getUTCDay();

  return {
    weekNumber,
    weekEndDate: range.weekEndDate,
    reportSubmitted: report?.submittedAt != null,
    dueSoon: daysToWeekEnd <= 1 || currentDay === reminderDay,
  };
}

/**
 * Faculty dashboard summary cards (06_App_Flow §7).
 *
 * Every count is restricted by `internshipScopeFilter`, so a faculty member's
 * numbers describe their own department and coordinated internships rather than the
 * whole institution.
 */
export async function getFacultyDashboard(auth: AuthContext): Promise<FacultyDashboard> {
  const scope = internshipScopeFilter(auth) as Prisma.InternshipWhereInput;
  const currentDate = today();
  const dateColumn = toDateColumn(currentDate);

  const activeWhere: Prisma.InternshipWhereInput = {
    AND: [scope, { status: { in: ['approved', 'active'] } }],
  };

  const [
    activeInternships,
    missingTodaysLog,
    pendingApproval,
    completedInternships,
    pendingDocumentReview,
    evaluationsOutstanding,
    activeIds,
  ] = await Promise.all([
    prisma.internship.count({ where: activeWhere }),

    // Active internships with no work log for today.
    prisma.internship.count({
      where: { AND: [activeWhere, { workLogs: { none: { workDate: dateColumn } } }] },
    }),

    prisma.internship.count({ where: { AND: [scope, { status: 'pending' }] } }),

    prisma.internship.count({ where: { AND: [scope, { status: 'completed' }] } }),

    prisma.document.count({
      where: {
        verificationStatus: 'pending',
        deletedAt: null,
        internship: scope,
      },
    }),

    // Finished or nearly finished internships whose mentor has not confirmed yet.
    prisma.internship.count({
      where: {
        AND: [
          scope,
          { status: { in: ['active', 'completed'] } },
          { mentorId: { not: null } },
          { OR: [{ mentorEvaluation: null }, { mentorEvaluation: { digitalConfirmation: false } }] },
        ],
      },
    }),

    prisma.internship.findMany({
      where: activeWhere,
      select: { id: true },
    }),
  ]);

  // Cohort attendance mean, computed from the batched summaries so it agrees with
  // the per-student figures on the list screen.
  const summaries = await getAttendanceSummaries(activeIds.map((row) => row.id));
  const percentages = [...summaries.values()]
    .filter((summary) => summary.totalWorkingDays > 0)
    .map((summary) => summary.attendancePercentage);

  const averageAttendancePercentage =
    percentages.length > 0
      ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 10) /
        10
      : null;

  return {
    activeInternships,
    missingTodaysLog,
    pendingDocumentReview,
    pendingApproval,
    evaluationsOutstanding,
    completedInternships,
    averageAttendancePercentage,
  };
}

/** Mentor dashboard: assigned students and what is waiting on them. */
export async function getMentorDashboard(mentorId: string): Promise<MentorDashboard> {
  const [assignedStudents, unverifiedAttendanceCount, pendingEvaluations] = await Promise.all([
    prisma.internship.count({
      where: { mentorId, status: { in: ['approved', 'active', 'completed'] } },
    }),
    prisma.attendance.count({
      where: {
        internship: { mentorId },
        mentorVerified: false,
        status: { in: ['present', 'absent', 'permission_leave'] },
      },
    }),
    prisma.internship.count({
      where: {
        mentorId,
        status: { in: ['active', 'completed'] },
        OR: [{ mentorEvaluation: null }, { mentorEvaluation: { digitalConfirmation: false } }],
      },
    }),
  ]);

  return { assignedStudents, unverifiedAttendanceCount, pendingEvaluations };
}
