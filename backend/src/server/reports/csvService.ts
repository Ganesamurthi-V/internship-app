/**
 * CSV rendering — 02_SRS §7: "All reports exportable as PDF or CSV".
 *
 * Escaping is the whole job here. Two things matter:
 *
 *  1. RFC 4180 quoting: any field containing a comma, quote, newline or carriage
 *     return is wrapped in quotes with inner quotes doubled. Work log activities are
 *     free text up to 200 words and routinely contain commas.
 *
 *  2. Formula injection. A field beginning with `=`, `+`, `-`, `@`, tab or carriage
 *     return is interpreted as a formula by Excel and Google Sheets, which turns an
 *     exported evidence file into an attack on whoever opens it. Such fields are
 *     prefixed with a single quote, which spreadsheets treat as "text follows".
 *     Nothing in the documents mentions this, but a report built from student-supplied
 *     free text and opened by faculty is exactly the scenario it applies to.
 */

import type { CohortAnalytics, StudentEvidenceReport } from '@ims/shared-types';
import {
  ATTENDANCE_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  MENTOR_RATING_FIELDS,
  MENTOR_RATING_LABELS,
  SKILL_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
} from '@ims/shared-types';

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = String(value);

  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    text = `'${text}`;
  }

  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/gu, '""')}"`;
  }

  return text;
}

function row(values: readonly unknown[]): string {
  return values.map(escapeField).join(',');
}

/**
 * Joins with CRLF per RFC 4180, and prefixes a UTF-8 BOM.
 *
 * The BOM is what makes Excel on Windows read the file as UTF-8 rather than the
 * local code page — without it, a student name with a non-ASCII character renders as
 * mojibake.
 */
function document(lines: readonly string[]): string {
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function blank(): string {
  return '';
}

export const toCsv = {
  /**
   * One student's evidence as a sectioned CSV.
   *
   * A single flat table cannot represent seven heterogeneous sections, so the file is
   * written as labelled blocks separated by blank lines — the shape a reviewer expects
   * when opening an evidence export in a spreadsheet.
   */
  studentEvidence(report: StudentEvidenceReport): string {
    const lines: string[] = [];

    lines.push(row(['Section', 'Field', 'Value']));

    const summary = report.attendanceSummary;
    const details: [string, unknown][] = [
      ['Name', report.student.name],
      ['Register Number', report.student.registerNumber],
      ['Programme', report.student.programme],
      ['Department', report.student.department?.name ?? ''],
      ['Organisation', report.internship.organisation?.name ?? ''],
      ['Domain', report.internship.domain],
      ['Mode', report.internship.mode],
      ['Start Date', report.internship.startDate],
      ['End Date', report.internship.endDate],
      ['Calendar Days', report.duration.calendarDays],
      ['Working Days', report.duration.workingDays],
      ['Hours Per Day', report.internship.workingHoursPerDay],
      ['Status', report.internship.status],
      ['Working Days Recorded', summary.totalWorkingDays],
      ['Days Attended', summary.daysAttended],
      ['Days Absent', summary.daysAbsent],
      ['Permission/Leave', summary.daysLeave],
      ['Holidays', summary.holidays],
      ['Attendance %', summary.attendancePercentage],
      ['Total Hours', summary.totalHours],
    ];

    for (const [field, value] of details) {
      lines.push(row(['Summary', field, value]));
    }

    lines.push(blank());
    lines.push(row(['Attendance']));
    lines.push(
      row(['Date', 'Status', 'Reporting', 'Leaving', 'Hours', 'Mode', 'Mentor Verified', 'Reason']),
    );
    for (const record of report.attendance) {
      lines.push(
        row([
          record.date,
          ATTENDANCE_STATUS_LABELS[record.status],
          record.reportingTime ?? '',
          record.leavingTime ?? '',
          record.totalHours ?? '',
          record.mode ?? '',
          record.mentorVerified ? 'Yes' : 'No',
          record.leaveReason ?? '',
        ]),
      );
    }

    lines.push(blank());
    lines.push(row(['Daily Work Logs']));
    lines.push(
      row([
        'Date',
        'Activities',
        'Technologies',
        'Task Assigned',
        'Completion',
        'Learning',
        'Challenge',
        'Solution',
        'Deliverable',
        'Mentor Interaction',
        'Mentor Feedback',
      ]),
    );
    for (const log of report.workLogs) {
      lines.push(
        row([
          log.workDate,
          log.activities,
          log.technologies.join('; '),
          log.taskAssigned ?? '',
          log.completionStatus ?? '',
          log.learning ?? '',
          log.challenge ?? '',
          log.solution ?? '',
          log.deliverableType ?? '',
          log.mentorInteraction ? 'Yes' : 'No',
          log.mentorFeedback ?? '',
        ]),
      );
    }

    lines.push(blank());
    lines.push(row(['Weekly Reports']));
    lines.push(
      row([
        'Week',
        'Start',
        'End',
        'Days Attended',
        'Total Hours',
        'Major Activities',
        'Technologies',
        'Skills',
        'Problems',
        'Solutions',
        'Learning Outcomes',
        'Mentor Feedback',
        'Self Assessment',
        'Submitted',
      ]),
    );
    for (const week of report.weeklyReports) {
      lines.push(
        row([
          week.weekNumber,
          week.weekStartDate,
          week.weekEndDate,
          week.daysAttended ?? '',
          week.totalHours ?? '',
          week.majorActivities ?? '',
          week.technologiesLearned.join('; '),
          week.skillsDeveloped.join('; '),
          week.problems ?? '',
          week.solutions ?? '',
          week.learningOutcomes ?? '',
          week.mentorFeedback ?? '',
          week.studentSelfAssessment ?? '',
          week.submittedAt ?? 'Draft',
        ]),
      );
    }

    lines.push(blank());
    lines.push(row(['Mentor Evaluation']));
    lines.push(row(['Parameter', 'Rating']));
    const evaluation = report.mentorEvaluation;
    if (evaluation) {
      for (const field of MENTOR_RATING_FIELDS) {
        lines.push(row([MENTOR_RATING_LABELS[field], evaluation[field] ?? '']));
      }
      lines.push(row(['Strengths', evaluation.strengths ?? '']));
      lines.push(row(['Areas for Improvement', evaluation.improvementAreas ?? '']));
      lines.push(row(['Remarks', evaluation.remarks ?? '']));
      lines.push(
        row([
          'Employment Recommendation',
          evaluation.employmentRecommendation === null
            ? ''
            : evaluation.employmentRecommendation
              ? 'Yes'
              : 'No',
        ]),
      );
      lines.push(row(['Digitally Confirmed', evaluation.submittedAt ?? '']));
    }

    lines.push(blank());
    lines.push(row(['Final Assessment']));
    const assessment = report.finalAssessment;
    if (assessment) {
      lines.push(row(['Field', 'Value']));
      lines.push(
        row([
          'Completed Successfully',
          assessment.completedSuccessfully === null
            ? ''
            : assessment.completedSuccessfully
              ? 'Yes'
              : 'No',
        ]),
      );
      lines.push(row(['Objectives Status', assessment.objectivesStatus ?? '']));
      lines.push(row(['Usefulness Rating', assessment.usefulnessRating ?? '']));
      lines.push(row(['Major Project', assessment.majorProject ?? '']));
      lines.push(row(['Technologies Mastered', assessment.technologiesMastered.join('; ')]));
      lines.push(row(['Skills Developed', assessment.skillsDeveloped.join('; ')]));
      lines.push(row(['Technical Improvement', assessment.technicalImprovement ?? '']));
      lines.push(row(['Employability Improvement', assessment.employabilityImprovement ?? '']));
      lines.push(row(['Curriculum Relation', assessment.curriculumRelation ?? '']));
      lines.push(row(['Real World Exposure', assessment.realWorldExposure ?? '']));
      lines.push(
        row([
          'Recommends Organisation',
          assessment.recommendOrganisation === null
            ? ''
            : assessment.recommendOrganisation
              ? 'Yes'
              : 'No',
        ]),
      );
      lines.push(row(['Suggestions', assessment.suggestions ?? '']));
      lines.push(row(['Submitted', assessment.submittedAt ?? 'Draft']));

      lines.push(blank());
      lines.push(row(['Skill Self-Ratings']));
      lines.push(row(['Skill', 'Rating']));
      for (const rating of assessment.skillRatings) {
        lines.push(row([SKILL_TYPE_LABELS[rating.skillType], rating.rating]));
      }
    }

    lines.push(blank());
    lines.push(row(['Documents']));
    lines.push(row(['Type', 'Filename', 'Status', 'Uploaded', 'Size (bytes)']));
    for (const doc of report.documents) {
      lines.push(
        row([
          DOCUMENT_TYPE_LABELS[doc.documentType],
          doc.originalFilename,
          VERIFICATION_STATUS_LABELS[doc.verificationStatus],
          doc.uploadedAt,
          doc.sizeBytes,
        ]),
      );
    }

    lines.push(blank());
    lines.push(row(['Technology Usage']));
    lines.push(row(['Technology', 'Days']));
    for (const entry of report.technologyUsage) {
      lines.push(row([entry.technology, entry.count]));
    }

    return document(lines);
  },

  /** Cohort analytics as sectioned CSV, for the aggregate NBA package. */
  cohortAnalytics(analytics: CohortAnalytics): string {
    const lines: string[] = [];

    lines.push(row(['Metric', 'Value']));
    lines.push(row(['Students', analytics.studentCount]));
    lines.push(row(['Average Attendance %', analytics.averageAttendancePercentage ?? '']));
    lines.push(row(['Total Hours', analytics.totalHours]));
    lines.push(row(['Document Completeness %', analytics.documentCompletenessPercentage]));

    lines.push(blank());
    lines.push(row(['Completion Status', 'Count']));
    for (const [status, count] of Object.entries(analytics.completionBreakdown)) {
      lines.push(row([status, count]));
    }

    lines.push(blank());
    lines.push(row(['Skill', 'Average Self-Rating']));
    for (const entry of analytics.averageSkillRatings) {
      lines.push(row([SKILL_TYPE_LABELS[entry.skillType], entry.average]));
    }

    lines.push(blank());
    lines.push(row(['Mentor Parameter', 'Average Rating']));
    for (const entry of analytics.averageMentorRatings) {
      lines.push(row([entry.field, entry.average]));
    }

    lines.push(blank());
    lines.push(row(['Technology', 'Days']));
    for (const entry of analytics.topTechnologies) {
      lines.push(row([entry.technology, entry.count]));
    }

    lines.push(blank());
    lines.push(row(['Organisation', 'Students']));
    for (const entry of analytics.organisationStats) {
      lines.push(row([entry.organisationName, entry.studentCount]));
    }

    lines.push(blank());
    lines.push(row(['Department', 'Students']));
    for (const entry of analytics.departmentStats) {
      lines.push(row([entry.departmentName, entry.studentCount]));
    }

    return document(lines);
  },
};
