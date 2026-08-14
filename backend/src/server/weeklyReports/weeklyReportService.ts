/**
 * Weekly reports — 01_PRD §4.4, 02_SRS §2.4, 06_App_Flow §5.
 *
 * The defining rule: `days_attended` and `total_hours` are aggregated from
 * attendance on the server every time the report is written, and are never read
 * from the request body. 02_SRS §2.4 says the student "cannot override without
 * faculty unlock", and 08_Implementation_Plan Phase 4 says aggregation is
 * "server-side, not client-trusted" — so `createWeeklyReportSchema` does not even
 * declare those fields.
 *
 * Week boundaries are internship-relative, not calendar-relative:
 * `floor((date - start_date) / 7) + 1`, per 04_Database_Design §5. Week 1 begins on
 * the internship start date, and the final week is clamped to the end date so the
 * range never extends past the internship (02_SRS §2.4).
 */

import type { CurrentWeekSummary } from '@ims/shared-types';
import type {
  CreateWeeklyReportInput,
  UpdateWeeklyReportInput,
} from '@ims/shared-validation';
import {
  calculateWeekNumber,
  calculateWeekRange,
  countInternshipWeeks,
} from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn } from '@/lib/clock';
import { conflict, forbidden, notFound, validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { toDateOnly } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { isAdmin, isStaff } from '@/lib/auth/guards';
import { getAttendanceSummary } from '@/server/attendance/summaryService';

export const WEEKLY_REPORT_SELECT = {
  id: true,
  internshipId: true,
  studentId: true,
  weekNumber: true,
  weekStartDate: true,
  weekEndDate: true,
  daysAttended: true,
  totalHours: true,
  majorActivities: true,
  technologiesLearned: true,
  skillsDeveloped: true,
  majorAssignment: true,
  problems: true,
  solutions: true,
  learningOutcomes: true,
  mentorFeedback: true,
  studentSelfAssessment: true,
  reportDocumentId: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  reportDocument: {
    select: {
      id: true,
      ownerUserId: true,
      documentType: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      checksum: true,
      uploadedAt: true,
      verifiedAt: true,
      verificationStatus: true,
      rejectionReason: true,
    },
  },
} as const;

interface InternshipPeriod {
  id: string;
  studentId: string;
  startDate: string;
  endDate: string;
  status: string;
}

async function loadPeriod(internshipId: string): Promise<InternshipPeriod> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { id: true, studentId: true, startDate: true, endDate: true, status: true },
  });
  if (!internship) throw notFound('Internship not found.');

  return {
    id: internship.id,
    studentId: internship.studentId,
    startDate: toDateOnly(internship.startDate),
    endDate: toDateOnly(internship.endDate),
    status: internship.status,
  };
}

/**
 * Validates a week number against the internship length.
 *
 * Without this, a client could create week 99 of a two-week internship and the
 * weekly timeline would show a phantom entry.
 */
function assertWeekInRange(period: InternshipPeriod, weekNumber: number): void {
  const totalWeeks = countInternshipWeeks(period.startDate, period.endDate);
  if (weekNumber < 1 || weekNumber > totalWeeks) {
    throw validationError(`This internship has ${totalWeeks} week(s).`, {
      weekNumber: `Choose a week between 1 and ${totalWeeks}.`,
    });
  }
}

/**
 * Aggregates attendance for one week.
 *
 * Reuses `getAttendanceSummary` with a date window, so the weekly figures and the
 * overall figures can never disagree — the guarantee 09_Test_Plan §2 asks for
 * ("weekly aggregation → days/hours match attendance records exactly").
 */
async function aggregateWeek(
  internshipId: string,
  weekStartDate: string,
  weekEndDate: string,
): Promise<{ daysAttended: number; totalHours: number }> {
  const summary = await getAttendanceSummary(internshipId, {
    from: weekStartDate,
    to: weekEndDate,
  });
  return { daysAttended: summary.daysAttended, totalHours: summary.totalHours };
}

/**
 * `GET /api/weekly-reports/current` — the week the student is currently in, with
 * pre-aggregated figures so the form can render read-only totals immediately.
 *
 * When today falls outside the internship, the week is clamped: before the start it
 * reports week 1, after the end it reports the final week. That keeps the dashboard
 * card meaningful on the day after an internship finishes rather than erroring.
 */
export async function getCurrentWeek(internshipId: string): Promise<CurrentWeekSummary> {
  const period = await loadPeriod(internshipId);
  const currentDate = today();

  const totalWeeks = countInternshipWeeks(period.startDate, period.endDate);
  const rawWeek = calculateWeekNumber(period.startDate, currentDate);
  const weekNumber = Math.min(Math.max(rawWeek ?? 1, 1), Math.max(totalWeeks, 1));

  const range = calculateWeekRange(period.startDate, period.endDate, weekNumber);
  const aggregates = await aggregateWeek(internshipId, range.weekStartDate, range.weekEndDate);

  const existing = await prisma.weeklyReport.findUnique({
    where: { internshipId_weekNumber: { internshipId, weekNumber } },
    select: { id: true, submittedAt: true },
  });

  return {
    weekNumber,
    weekStartDate: range.weekStartDate,
    weekEndDate: range.weekEndDate,
    daysAttended: aggregates.daysAttended,
    totalHours: aggregates.totalHours,
    reportExists: existing !== null,
    ...(existing ? { reportId: existing.id, submitted: existing.submittedAt !== null } : {}),
  };
}

/**
 * Creates a weekly report draft, or returns the existing one for that week.
 *
 * Returning the existing draft rather than 409 is deliberate: the app opens
 * `weekly-report/[week]` and needs a record to edit, and whether one already exists
 * is not something the student should have to care about.
 */
export async function createOrGetWeeklyReport(
  auth: AuthContext,
  input: CreateWeeklyReportInput,
) {
  const period = await loadPeriod(input.internshipId);

  if (period.status === 'pending' || period.status === 'rejected') {
    throw conflict('Your internship registration is not approved yet.');
  }

  assertWeekInRange(period, input.weekNumber);

  const existing = await prisma.weeklyReport.findUnique({
    where: {
      internshipId_weekNumber: { internshipId: input.internshipId, weekNumber: input.weekNumber },
    },
    select: WEEKLY_REPORT_SELECT,
  });

  if (existing) {
    if (existing.submittedAt) {
      throw conflict('This week\u2019s report has already been submitted.');
    }
    return updateWeeklyReport(auth, existing.id, stripIdentity(input));
  }

  const range = calculateWeekRange(period.startDate, period.endDate, input.weekNumber);
  const aggregates = await aggregateWeek(
    input.internshipId,
    range.weekStartDate,
    range.weekEndDate,
  );

  return prisma.weeklyReport.create({
    data: {
      internshipId: input.internshipId,
      // Derived from the internship, never taken from the client.
      studentId: period.studentId,
      weekNumber: input.weekNumber,
      weekStartDate: toDateColumn(range.weekStartDate),
      weekEndDate: toDateColumn(range.weekEndDate),
      daysAttended: aggregates.daysAttended,
      totalHours: aggregates.totalHours,
      majorActivities: input.majorActivities ?? null,
      technologiesLearned: input.technologiesLearned ?? [],
      skillsDeveloped: input.skillsDeveloped ?? [],
      majorAssignment: input.majorAssignment ?? null,
      problems: input.problems ?? null,
      solutions: input.solutions ?? null,
      learningOutcomes: input.learningOutcomes ?? null,
      mentorFeedback: input.mentorFeedback ?? null,
      studentSelfAssessment: input.studentSelfAssessment ?? null,
      reportDocumentId: input.reportDocumentId ?? null,
    },
    select: WEEKLY_REPORT_SELECT,
  });
}

/** Drops the fields that identify the report, leaving only editable content. */
function stripIdentity(input: CreateWeeklyReportInput): UpdateWeeklyReportInput {
  const { internshipId: _internshipId, weekNumber: _weekNumber, ...rest } = input;
  return rest;
}

export async function updateWeeklyReport(
  auth: AuthContext,
  reportId: string,
  input: UpdateWeeklyReportInput,
) {
  const existing = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      internshipId: true,
      weekNumber: true,
      weekStartDate: true,
      weekEndDate: true,
      submittedAt: true,
      studentId: true,
    },
  });
  if (!existing) throw notFound('Weekly report not found.');

  /**
   * A submitted report is closed to the student. Staff may still correct one —
   * they are the ones who would have asked for the change.
   */
  if (existing.submittedAt && !isStaff(auth)) {
    throw forbidden(
      'This report has been submitted. Ask your faculty coordinator if it needs changing.',
    );
  }

  // Re-aggregate on every write: attendance for the week may have been added or
  // edited since the draft was created.
  const aggregates = await aggregateWeek(
    existing.internshipId,
    toDateOnly(existing.weekStartDate),
    toDateOnly(existing.weekEndDate),
  );

  return prisma.weeklyReport.update({
    where: { id: reportId },
    data: {
      daysAttended: aggregates.daysAttended,
      totalHours: aggregates.totalHours,
      ...(input.majorActivities !== undefined ? { majorActivities: input.majorActivities } : {}),
      ...(input.technologiesLearned !== undefined
        ? { technologiesLearned: input.technologiesLearned }
        : {}),
      ...(input.skillsDeveloped !== undefined ? { skillsDeveloped: input.skillsDeveloped } : {}),
      ...(input.majorAssignment !== undefined ? { majorAssignment: input.majorAssignment } : {}),
      ...(input.problems !== undefined ? { problems: input.problems } : {}),
      ...(input.solutions !== undefined ? { solutions: input.solutions } : {}),
      ...(input.learningOutcomes !== undefined
        ? { learningOutcomes: input.learningOutcomes }
        : {}),
      ...(input.mentorFeedback !== undefined ? { mentorFeedback: input.mentorFeedback } : {}),
      ...(input.studentSelfAssessment !== undefined
        ? { studentSelfAssessment: input.studentSelfAssessment }
        : {}),
      ...(input.reportDocumentId !== undefined
        ? { reportDocumentId: input.reportDocumentId }
        : {}),
    },
    select: WEEKLY_REPORT_SELECT,
  });
}

/**
 * Submits the report.
 *
 * 06_App_Flow §5 lists "Upload weekly PDF (required for submission)", so the
 * document is mandatory here even though it is optional while drafting. Enforced
 * server-side because the client-side check is skippable.
 */
export async function submitWeeklyReport(
  auth: AuthContext,
  reportId: string,
  reportDocumentId: string | null | undefined,
) {
  const existing = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      internshipId: true,
      weekNumber: true,
      weekStartDate: true,
      weekEndDate: true,
      reportDocumentId: true,
      submittedAt: true,
    },
  });
  if (!existing) throw notFound('Weekly report not found.');

  if (existing.submittedAt && !isAdmin(auth)) {
    throw conflict('This report has already been submitted.');
  }

  const documentId = reportDocumentId ?? existing.reportDocumentId;
  if (!documentId) {
    throw validationError('Upload the weekly report PDF before submitting.', {
      reportDocumentId: 'The weekly report PDF is required.',
    });
  }

  const aggregates = await aggregateWeek(
    existing.internshipId,
    toDateOnly(existing.weekStartDate),
    toDateOnly(existing.weekEndDate),
  );

  const report = await prisma.weeklyReport.update({
    where: { id: reportId },
    data: {
      reportDocumentId: documentId,
      daysAttended: aggregates.daysAttended,
      totalHours: aggregates.totalHours,
      submittedAt: new Date(),
    },
    select: WEEKLY_REPORT_SELECT,
  });

  await recordAudit({
    action: 'weekly_report_submitted',
    entityType: 'weekly_report',
    entityId: reportId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      weekNumber: existing.weekNumber,
      daysAttended: aggregates.daysAttended,
      totalHours: aggregates.totalHours,
    },
  });

  return report;
}
