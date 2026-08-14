/**
 * Student evidence assembly — 06_App_Flow §8, 02_SRS §7.
 *
 * Builds the seven-section student package listed in 06_App_Flow §8:
 *   1. Registration & internship details
 *   2. Attendance calendar + summary
 *   3. All daily work logs (chronological)
 *   4. All weekly reports
 *   5. Mentor evaluation
 *   6. Final assessment + skill ratings
 *   7. All uploaded certificates/documents
 *
 * This is the shape that both the JSON report endpoint and the PDF renderer consume,
 * so what a faculty member sees on screen and what lands in the exported file are
 * built from exactly the same data.
 */

import type { CohortAnalytics, StudentEvidenceReport } from '@ims/shared-types';
import { MENTOR_RATING_FIELDS, MENTOR_RATING_LABELS, SKILL_TYPES } from '@ims/shared-types';
import { calculateInternshipDuration } from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import {
  serializeAttendance,
  serializeDocument,
  serializeFinalAssessment,
  serializeInternship,
  serializeMentorEvaluation,
  serializeStudent,
  serializeWeeklyReport,
  serializeWorkLog,
  toDateOnly,
} from '@/lib/serialize';
import { getAttendanceSummary, getAttendanceSummaries } from '@/server/attendance/summaryService';
import { ATTENDANCE_SELECT } from '@/server/attendance/attendanceService';
import { WORK_LOG_SELECT } from '@/server/workLogs/workLogService';
import { WEEKLY_REPORT_SELECT } from '@/server/weeklyReports/weeklyReportService';
import { FINAL_ASSESSMENT_SELECT } from '@/server/finalAssessment/finalAssessmentService';
import { EVALUATION_SELECT } from '@/server/mentors/evaluationService';
import { DOCUMENT_SELECT } from '@/server/documents/documentService';

/**
 * Assembles one student's full evidence package.
 *
 * Everything is fetched in parallel; the record counts are bounded by the internship
 * length (a few hundred rows at most), so there is no pagination here — an evidence
 * package is all-or-nothing by definition.
 */
export async function buildStudentEvidence(internshipId: string): Promise<StudentEvidenceReport> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
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
      mentor: {
        select: {
          id: true,
          userId: true,
          name: true,
          designation: true,
          email: true,
          contact: true,
          organisationId: true,
          inviteToken: true,
          inviteExpires: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      student: {
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
      },
    },
  });

  if (!internship) throw notFound('Internship not found.');

  const [attendance, workLogs, weeklyReports, mentorEvaluation, finalAssessment, documents, summary] =
    await Promise.all([
      prisma.attendance.findMany({
        where: { internshipId },
        orderBy: { attendanceDate: 'asc' },
        select: ATTENDANCE_SELECT,
      }),
      prisma.dailyWorkLog.findMany({
        where: { internshipId },
        // Chronological, per 06_App_Flow §8 section 3.
        orderBy: { workDate: 'asc' },
        select: WORK_LOG_SELECT,
      }),
      prisma.weeklyReport.findMany({
        where: { internshipId },
        orderBy: { weekNumber: 'asc' },
        select: WEEKLY_REPORT_SELECT,
      }),
      prisma.mentorEvaluation.findUnique({
        where: { internshipId },
        select: EVALUATION_SELECT,
      }),
      prisma.finalAssessment.findUnique({
        where: { internshipId },
        select: FINAL_ASSESSMENT_SELECT,
      }),
      prisma.document.findMany({
        where: { internshipId, deletedAt: null },
        orderBy: { uploadedAt: 'asc' },
        select: DOCUMENT_SELECT,
      }),
      getAttendanceSummary(internshipId),
    ]);

  return {
    // Evidence packages are for institutional review, so contact details are
    // included here — unlike list views, which redact them.
    student: serializeStudent(internship.student, { includeContactDetails: true }),
    internship: serializeInternship(internship),
    duration: calculateInternshipDuration(
      toDateOnly(internship.startDate),
      toDateOnly(internship.endDate),
    ),
    attendanceSummary: summary,
    attendance: attendance.map(serializeAttendance),
    workLogs: workLogs.map(serializeWorkLog),
    weeklyReports: weeklyReports.map(serializeWeeklyReport),
    mentorEvaluation: mentorEvaluation ? serializeMentorEvaluation(mentorEvaluation) : null,
    finalAssessment: finalAssessment ? serializeFinalAssessment(finalAssessment) : null,
    documents: documents.map(serializeDocument),
    technologyUsage: aggregateTechnologies(workLogs.map((log) => log.technologies)),
  };
}

/**
 * Counts technology tags across work logs, most frequent first (02_SRS §7
 * "Technology usage tags (aggregated per cohort)").
 *
 * Counted case-insensitively so "React" and "react" are one entry, but the first
 * spelling encountered is kept for display.
 */
function aggregateTechnologies(
  tagLists: readonly string[][],
): { technology: string; count: number }[] {
  const counts = new Map<string, { technology: string; count: number }>();

  for (const tags of tagLists) {
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { technology: tag, count: 1 });
      }
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.technology.localeCompare(b.technology),
  );
}

/**
 * Cohort analytics backing sections D and E of the NBA package (06_App_Flow §8).
 *
 * `scope` is a Prisma internship filter, so the caller decides whether this covers a
 * department, an organisation, a date range, or a faculty member's own students —
 * and the authorization scope filter can be composed straight into it.
 */
export async function buildCohortAnalytics(
  scope: Prisma.InternshipWhereInput,
): Promise<CohortAnalytics> {
  const internships = await prisma.internship.findMany({
    where: scope,
    select: {
      id: true,
      status: true,
      organisation: { select: { name: true } },
      student: { select: { department: { select: { name: true } } } },
    },
  });

  const internshipIds = internships.map((internship) => internship.id);

  if (internshipIds.length === 0) {
    return {
      studentCount: 0,
      averageAttendancePercentage: null,
      totalHours: 0,
      completionBreakdown: {},
      documentCompletenessPercentage: 0,
      averageSkillRatings: [],
      averageMentorRatings: [],
      topTechnologies: [],
      organisationStats: [],
      departmentStats: [],
    };
  }

  const [summaries, skillAverages, mentorEvaluations, workLogTags, verifiedDocumentCounts] =
    await Promise.all([
      getAttendanceSummaries(internshipIds),

      prisma.skillRating.groupBy({
        by: ['skillType'],
        where: { finalAssessment: { internshipId: { in: internshipIds } } },
        _avg: { rating: true },
      }),

      prisma.mentorEvaluation.findMany({
        where: { internshipId: { in: internshipIds }, digitalConfirmation: true },
        select: EVALUATION_SELECT,
      }),

      prisma.dailyWorkLog.findMany({
        where: { internshipId: { in: internshipIds } },
        select: { technologies: true },
      }),

      prisma.document.groupBy({
        by: ['internshipId'],
        where: {
          internshipId: { in: internshipIds },
          verificationStatus: 'verified',
          deletedAt: null,
        },
        _count: { _all: true },
      }),
    ]);

  const percentages = [...summaries.values()]
    .filter((summary) => summary.totalWorkingDays > 0)
    .map((summary) => summary.attendancePercentage);

  const totalHours = [...summaries.values()].reduce((sum, summary) => sum + summary.totalHours, 0);

  const completionBreakdown: Record<string, number> = {};
  for (const internship of internships) {
    completionBreakdown[internship.status] = (completionBreakdown[internship.status] ?? 0) + 1;
  }

  // Mentor rating averages, computed across the ten parameters. Driven by the shared
  // constant so adding a parameter cannot leave it silently excluded.
  const averageMentorRatings = MENTOR_RATING_FIELDS.map((field) => {
    const values = mentorEvaluations
      .map((evaluation) => evaluation[field])
      .filter((value): value is number => typeof value === 'number');

    return {
      field: MENTOR_RATING_LABELS[field],
      average:
        values.length > 0
          ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
          : 0,
    };
  }).filter((entry) => entry.average > 0);

  // Document completeness: verified documents against the required checklist size,
  // averaged across the cohort.
  const requiredPerStudent = 4; // completion certificate, report, offer letter, attendance statement
  const completenessValues = internshipIds.map((id) => {
    const verified = verifiedDocumentCounts.find((row) => row.internshipId === id)?._count._all ?? 0;
    return Math.min(100, Math.round((verified / requiredPerStudent) * 100));
  });

  return {
    studentCount: internshipIds.length,
    averageAttendancePercentage:
      percentages.length > 0
        ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 10) /
          10
        : null,
    totalHours: Math.round(totalHours * 100) / 100,
    completionBreakdown,
    documentCompletenessPercentage:
      completenessValues.length > 0
        ? Math.round(
            completenessValues.reduce((sum, value) => sum + value, 0) / completenessValues.length,
          )
        : 0,
    averageSkillRatings: SKILL_TYPES.map((skillType) => {
      const row = skillAverages.find((entry) => entry.skillType === skillType);
      return {
        skillType,
        average: row?._avg.rating ? Math.round(row._avg.rating * 10) / 10 : 0,
      };
    }).filter((entry) => entry.average > 0),
    averageMentorRatings,
    topTechnologies: aggregateTechnologies(workLogTags.map((log) => log.technologies)).slice(0, 20),
    organisationStats: countBy(
      internships.map((internship) => internship.organisation?.name ?? 'Not specified'),
    ).map(([organisationName, studentCount]) => ({ organisationName, studentCount })),
    departmentStats: countBy(
      internships.map((internship) => internship.student.department?.name ?? 'Not specified'),
    ).map(([departmentName, studentCount]) => ({ departmentName, studentCount })),
  };
}

/** Frequency count, highest first. */
function countBy(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
