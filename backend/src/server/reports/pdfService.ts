/**
 * Evidence PDF rendering — 06_App_Flow §8, 02_SRS §7.
 *
 * Renders the seven-section student package with PDFKit. PDFKit is chosen over a
 * headless-browser approach because it has no native dependencies and no Chromium
 * download, which keeps the "< 10 seconds" target in 09_Test_Plan §7 reachable on a
 * small server and keeps the container small.
 *
 * The document is built into a Buffer rather than streamed to the response, because
 * the export flow stores it in Supabase Storage and hands back a signed URL.
 */

import PDFDocument from 'pdfkit';
import type { CohortAnalytics, StudentEvidenceReport } from '@ims/shared-types';
import {
  ATTENDANCE_STATUS_LABELS,
  COMPLETION_STATUS_LABELS,
  DELIVERABLE_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  INTERNSHIP_DOMAIN_LABELS,
  INTERNSHIP_MODE_LABELS,
  MENTOR_RATING_FIELDS,
  MENTOR_RATING_LABELS,
  OBJECTIVES_STATUS_LABELS,
  SKILL_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
} from '@ims/shared-types';
import { env } from '@/lib/env';

const MARGIN = 48;
const HEADING_COLOR = '#1e3a5f';
const MUTED_COLOR = '#555555';

/** Collects the PDF stream into a single Buffer. */
function renderToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string): void {
  // Start a new page when there is not enough room for a heading plus a line or two,
  // so a section title never sits alone at the foot of a page.
  if (doc.y > doc.page.height - MARGIN - 80) doc.addPage();

  doc.moveDown(0.8);
  doc.fillColor(HEADING_COLOR).fontSize(13).font('Helvetica-Bold').text(text);
  doc
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(doc.page.width - MARGIN, doc.y + 2)
    .strokeColor(HEADING_COLOR)
    .lineWidth(0.8)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor('#000000').fontSize(10).font('Helvetica');
}

/** Two-column key/value rows, used for the detail blocks. */
function keyValues(doc: PDFKit.PDFDocument, rows: [string, string][]): void {
  const labelWidth = 150;
  for (const [label, value] of rows) {
    if (doc.y > doc.page.height - MARGIN - 30) doc.addPage();
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED_COLOR).text(label, MARGIN, y, {
      width: labelWidth,
    });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000000')
      .text(value || '\u2014', MARGIN + labelWidth, y, {
        width: doc.page.width - MARGIN * 2 - labelWidth,
      });
    doc.moveDown(0.35);
  }
}

function paragraph(doc: PDFKit.PDFDocument, label: string, value: string | null): void {
  if (!value) return;
  if (doc.y > doc.page.height - MARGIN - 60) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED_COLOR).text(label);
  doc.font('Helvetica').fontSize(10).fillColor('#000000').text(value, { align: 'left' });
  doc.moveDown(0.4);
}

/**
 * Renders one student's evidence package.
 *
 * Section order follows 06_App_Flow §8 exactly, because that list is what an NBA
 * reviewer expects to find and in what order.
 */
export function renderStudentEvidencePdf(report: StudentEvidenceReport): Promise<Buffer> {
  return renderToBuffer((doc) => {
    // ---- Title page header ----
    doc.fillColor(HEADING_COLOR).fontSize(18).font('Helvetica-Bold').text(env.INSTITUTION_NAME, {
      align: 'center',
    });
    doc.fontSize(13).text('Internship Evidence Record', { align: 'center' });
    doc
      .fontSize(9)
      .fillColor(MUTED_COLOR)
      .font('Helvetica')
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
    doc.moveDown(1);

    // ---- 1. Registration & internship details ----
    sectionHeading(doc, '1. Student & Internship Details');
    keyValues(doc, [
      ['Name', report.student.name],
      ['Register Number', report.student.registerNumber],
      ['Programme', report.student.programme],
      ['Department', report.student.department?.name ?? '\u2014'],
      ['Year / Section', `${report.student.year ?? '\u2014'} / ${report.student.section ?? '\u2014'}`],
      ['Organisation', report.internship.organisation?.name ?? '\u2014'],
      ['Location', report.internship.organisation?.location ?? '\u2014'],
      ['Domain', INTERNSHIP_DOMAIN_LABELS[report.internship.domain]],
      ['Mode', INTERNSHIP_MODE_LABELS[report.internship.mode]],
      ['Start Date', report.internship.startDate],
      ['End Date', report.internship.endDate],
      [
        'Duration',
        `${report.duration.calendarDays} calendar days (${report.duration.workingDays} working days)`,
      ],
      ['Hours per Day', String(report.internship.workingHoursPerDay)],
      ['Industry Mentor', report.internship.mentor?.name ?? '\u2014'],
      ['Mentor Designation', report.internship.mentor?.designation ?? '\u2014'],
      ['Status', report.internship.status],
    ]);

    // ---- 2. Attendance summary ----
    sectionHeading(doc, '2. Attendance Summary');
    const summary = report.attendanceSummary;
    keyValues(doc, [
      ['Working Days', String(summary.totalWorkingDays)],
      ['Days Attended', String(summary.daysAttended)],
      ['Days Absent', String(summary.daysAbsent)],
      ['Permission / Leave', String(summary.daysLeave)],
      ['Holidays / Weekly Off', String(summary.holidays)],
      ['Attendance Percentage', `${summary.attendancePercentage}%`],
      ['Total Hours', String(summary.totalHours)],
    ]);

    if (report.attendance.length > 0) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED_COLOR).text('Daily attendance register');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(8.5).fillColor('#000000');

      for (const record of report.attendance) {
        if (doc.y > doc.page.height - MARGIN - 24) doc.addPage();
        const times =
          record.reportingTime && record.leavingTime
            ? `${record.reportingTime}\u2013${record.leavingTime}`
            : '\u2014';
        const hours = record.totalHours !== null ? `${record.totalHours} h` : '\u2014';
        const verified = record.mentorVerified ? ' [mentor verified]' : '';
        doc.text(
          `${record.date}   ${ATTENDANCE_STATUS_LABELS[record.status]}   ${times}   ${hours}${verified}`,
        );
      }
    }

    // ---- 3. Daily work logs ----
    sectionHeading(doc, '3. Daily Work Logs');
    if (report.workLogs.length === 0) {
      doc.fillColor(MUTED_COLOR).text('No work logs recorded.');
    } else {
      for (const log of report.workLogs) {
        if (doc.y > doc.page.height - MARGIN - 120) doc.addPage();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(HEADING_COLOR).text(log.workDate);
        doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
        paragraph(doc, 'Activities', log.activities);
        if (log.technologies.length > 0) {
          keyValues(doc, [['Technologies', log.technologies.join(', ')]]);
        }
        keyValues(doc, [
          ['Task Assigned', log.taskAssigned ?? '\u2014'],
          [
            'Completion',
            log.completionStatus ? COMPLETION_STATUS_LABELS[log.completionStatus] : '\u2014',
          ],
          [
            'Deliverable',
            log.deliverableType ? DELIVERABLE_TYPE_LABELS[log.deliverableType] : '\u2014',
          ],
          ['Mentor Interaction', log.mentorInteraction ? 'Yes' : 'No'],
        ]);
        paragraph(doc, 'Key Learning', log.learning);
        paragraph(doc, 'Challenge', log.challenge);
        paragraph(doc, 'Solution', log.solution);
        paragraph(doc, 'Mentor Feedback', log.mentorFeedback);
      }
    }

    // ---- 4. Weekly reports ----
    sectionHeading(doc, '4. Weekly Reports');
    if (report.weeklyReports.length === 0) {
      doc.fillColor(MUTED_COLOR).text('No weekly reports submitted.');
    } else {
      for (const week of report.weeklyReports) {
        if (doc.y > doc.page.height - MARGIN - 120) doc.addPage();
        doc.moveDown(0.3);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(HEADING_COLOR)
          .text(`Week ${week.weekNumber} (${week.weekStartDate} to ${week.weekEndDate})`);
        doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
        keyValues(doc, [
          ['Days Attended', String(week.daysAttended ?? '\u2014')],
          ['Total Hours', String(week.totalHours ?? '\u2014')],
          ['Technologies', week.technologiesLearned.join(', ')],
          ['Skills', week.skillsDeveloped.join(', ')],
          ['Submitted', week.submittedAt ? week.submittedAt.slice(0, 10) : 'Draft'],
        ]);
        paragraph(doc, 'Major Activities', week.majorActivities);
        paragraph(doc, 'Major Assignment', week.majorAssignment);
        paragraph(doc, 'Problems', week.problems);
        paragraph(doc, 'Solutions', week.solutions);
        paragraph(doc, 'Learning Outcomes', week.learningOutcomes);
        paragraph(doc, 'Mentor Feedback', week.mentorFeedback);
        paragraph(doc, 'Self Assessment', week.studentSelfAssessment);
      }
    }

    // ---- 5. Mentor evaluation ----
    sectionHeading(doc, '5. Industry Mentor Evaluation');
    const evaluation = report.mentorEvaluation;
    if (!evaluation || !evaluation.digitalConfirmation) {
      doc.fillColor(MUTED_COLOR).text('No confirmed mentor evaluation on record.');
    } else {
      keyValues(
        doc,
        MENTOR_RATING_FIELDS.map((field) => [
          MENTOR_RATING_LABELS[field],
          evaluation[field] !== null ? `${evaluation[field]} / 5` : '\u2014',
        ]),
      );
      paragraph(doc, 'Strengths', evaluation.strengths);
      paragraph(doc, 'Areas for Improvement', evaluation.improvementAreas);
      paragraph(doc, 'Overall Remarks', evaluation.remarks);
      keyValues(doc, [
        [
          'Employment Recommendation',
          evaluation.employmentRecommendation === null
            ? '\u2014'
            : evaluation.employmentRecommendation
              ? 'Yes'
              : 'No',
        ],
        [
          'Digitally Confirmed',
          evaluation.submittedAt ? evaluation.submittedAt.slice(0, 10) : '\u2014',
        ],
      ]);
    }

    // ---- 6. Final assessment + skill ratings ----
    sectionHeading(doc, '6. Final Assessment & Self-Rating');
    const assessment = report.finalAssessment;
    if (!assessment) {
      doc.fillColor(MUTED_COLOR).text('Final assessment not submitted.');
    } else {
      keyValues(doc, [
        [
          'Completed Successfully',
          assessment.completedSuccessfully === null
            ? '\u2014'
            : assessment.completedSuccessfully
              ? 'Yes'
              : 'No',
        ],
        ['Total Days Attended', String(assessment.totalDaysAttended ?? '\u2014')],
        ['Total Hours', String(assessment.totalHours ?? '\u2014')],
        [
          'Objectives Achieved',
          assessment.objectivesStatus
            ? OBJECTIVES_STATUS_LABELS[assessment.objectivesStatus]
            : '\u2014',
        ],
        [
          'Usefulness Rating',
          assessment.usefulnessRating !== null ? `${assessment.usefulnessRating} / 5` : '\u2014',
        ],
        ['Technologies Mastered', assessment.technologiesMastered.join(', ')],
        ['Skills Developed', assessment.skillsDeveloped.join(', ')],
        [
          'Recommends Organisation',
          assessment.recommendOrganisation === null
            ? '\u2014'
            : assessment.recommendOrganisation
              ? 'Yes'
              : 'No',
        ],
        ['Submitted', assessment.submittedAt ? assessment.submittedAt.slice(0, 10) : 'Draft'],
      ]);
      paragraph(doc, 'Major Project', assessment.majorProject);
      paragraph(doc, 'Technical Improvement', assessment.technicalImprovement);
      paragraph(doc, 'Employability Improvement', assessment.employabilityImprovement);
      paragraph(doc, 'Curriculum Relationship', assessment.curriculumRelation);
      paragraph(doc, 'Real-World Exposure', assessment.realWorldExposure);
      paragraph(doc, 'Suggestions', assessment.suggestions);

      if (assessment.skillRatings.length > 0) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED_COLOR).text('Skill self-ratings');
        doc.moveDown(0.2);
        keyValues(
          doc,
          assessment.skillRatings.map((rating) => [
            SKILL_TYPE_LABELS[rating.skillType],
            `${rating.rating} / 5`,
          ]),
        );
      }
    }

    // ---- 7. Documents ----
    sectionHeading(doc, '7. Documentary Evidence');
    if (report.documents.length === 0) {
      doc.fillColor(MUTED_COLOR).text('No documents uploaded.');
    } else {
      // Filenames and verification status only. The files themselves stay in private
      // storage; embedding them would defeat the access controls in
      // 07_Security_and_Privacy §4.
      for (const document of report.documents) {
        if (doc.y > doc.page.height - MARGIN - 24) doc.addPage();
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#000000')
          .text(
            `${DOCUMENT_TYPE_LABELS[document.documentType]} \u2014 ${document.originalFilename} ` +
              `(${VERIFICATION_STATUS_LABELS[document.verificationStatus]}, ` +
              `uploaded ${document.uploadedAt.slice(0, 10)})`,
          );
      }
    }

    // ---- Technology usage ----
    if (report.technologyUsage.length > 0) {
      sectionHeading(doc, 'Appendix: Technology Usage');
      keyValues(
        doc,
        report.technologyUsage
          .slice(0, 30)
          .map((entry) => [entry.technology, `${entry.count} day(s)`]),
      );
    }

    addPageNumbers(doc);
  });
}

/** Aggregate cohort report for the NBA package (06_App_Flow §8, sections A–F). */
export function renderCohortAnalyticsPdf(
  analytics: CohortAnalytics,
  title: string,
): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.fillColor(HEADING_COLOR).fontSize(18).font('Helvetica-Bold').text(env.INSTITUTION_NAME, {
      align: 'center',
    });
    doc.fontSize(13).text('Internship Programme Report', { align: 'center' });
    doc.fontSize(10).fillColor(MUTED_COLOR).font('Helvetica').text(title, { align: 'center' });
    doc.moveDown(1);

    sectionHeading(doc, 'B. Participation');
    keyValues(doc, [
      ['Students', String(analytics.studentCount)],
      [
        'Average Attendance',
        analytics.averageAttendancePercentage !== null
          ? `${analytics.averageAttendancePercentage}%`
          : '\u2014',
      ],
      ['Total Hours', String(analytics.totalHours)],
      ['Document Completeness', `${analytics.documentCompletenessPercentage}%`],
    ]);

    sectionHeading(doc, 'Completion Status Breakdown');
    keyValues(
      doc,
      Object.entries(analytics.completionBreakdown).map(([status, count]) => [
        status,
        String(count),
      ]),
    );

    sectionHeading(doc, 'C. Activities \u2014 Technology Usage');
    keyValues(
      doc,
      analytics.topTechnologies.map((entry) => [entry.technology, `${entry.count} day(s)`]),
    );

    sectionHeading(doc, 'D. Assessment \u2014 Mentor Rating Averages');
    if (analytics.averageMentorRatings.length === 0) {
      doc.fillColor(MUTED_COLOR).text('No confirmed mentor evaluations yet.');
    } else {
      keyValues(
        doc,
        analytics.averageMentorRatings.map((entry) => [entry.field, `${entry.average} / 5`]),
      );
    }

    sectionHeading(doc, 'E. Impact \u2014 Skill Self-Rating Averages');
    if (analytics.averageSkillRatings.length === 0) {
      doc.fillColor(MUTED_COLOR).text('No submitted self-assessments yet.');
    } else {
      keyValues(
        doc,
        analytics.averageSkillRatings.map((entry) => [
          SKILL_TYPE_LABELS[entry.skillType],
          `${entry.average} / 5`,
        ]),
      );
    }

    sectionHeading(doc, 'Organisation-wise Statistics');
    keyValues(
      doc,
      analytics.organisationStats.map((entry) => [
        entry.organisationName,
        `${entry.studentCount} student(s)`,
      ]),
    );

    sectionHeading(doc, 'Department-wise Statistics');
    keyValues(
      doc,
      analytics.departmentStats.map((entry) => [
        entry.departmentName,
        `${entry.studentCount} student(s)`,
      ]),
    );

    addPageNumbers(doc);
  });
}

/**
 * Stamps "Page n of m" on every page.
 *
 * Requires `bufferPages: true`, which is why the document is constructed with it —
 * the total is only known once the content is laid out.
 */
function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED_COLOR)
      .text(
        `Page ${index + 1} of ${range.count}`,
        MARGIN,
        doc.page.height - MARGIN + 10,
        { align: 'center', width: doc.page.width - MARGIN * 2 },
      );
  }
}
