/**
 * CSV escaping tests.
 *
 * 09_Test_Plan §6 covers malicious filenames for uploads; the same reasoning applies
 * to exports. An evidence CSV is built from student-supplied free text and opened by
 * faculty in Excel, so both RFC 4180 quoting and formula-injection neutralisation are
 * correctness requirements, not polish.
 */

import { describe, expect, it } from 'vitest';
import type { CohortAnalytics, StudentEvidenceReport } from '@ims/shared-types';
import { toCsv } from './csvService';

/** Minimal but complete report fixture; fields under test are overridden per case. */
function buildReport(overrides?: {
  activities?: string;
  studentName?: string;
  filename?: string;
}): StudentEvidenceReport {
  return {
    student: {
      id: 'student-1',
      userId: 'user-1',
      registerNumber: '21CS101',
      name: overrides?.studentName ?? 'Praveen Kumar',
      programme: 'B.E. Computer Science',
      departmentId: 'dept-1',
      department: null,
      year: 3,
      section: 'A',
      studentEmail: 'praveen@smvec.ac.in',
      mobile: '9876543210',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    internship: {
      id: 'internship-1',
      studentId: 'student-1',
      organisationId: 'org-1',
      organisation: null,
      mentorId: null,
      mentor: null,
      facultyCoordinatorId: null,
      domain: 'software_development',
      mode: 'offline',
      startDate: '2026-06-01',
      endDate: '2026-07-31',
      durationDays: 60,
      workingHoursPerDay: 8,
      status: 'completed',
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    duration: { calendarDays: 61, workingDays: 44, totalWeeks: 9 },
    attendanceSummary: {
      totalWorkingDays: 44,
      daysAttended: 42,
      daysAbsent: 1,
      daysLeave: 1,
      holidays: 8,
      attendancePercentage: 95.5,
      totalHours: 357,
    },
    attendance: [],
    workLogs: overrides?.activities
      ? [
          {
            id: 'log-1',
            internshipId: 'internship-1',
            studentId: 'student-1',
            workDate: '2026-06-01',
            activities: overrides.activities,
            technologies: ['Python'],
            taskAssigned: null,
            completionStatus: 'yes',
            learning: null,
            challenge: null,
            solution: null,
            deliverableType: 'code',
            evidenceDocumentId: null,
            mentorInteraction: false,
            mentorFeedback: null,
            clientId: null,
            syncedAt: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ]
      : [],
    weeklyReports: [],
    mentorEvaluation: null,
    finalAssessment: null,
    documents: overrides?.filename
      ? [
          {
            id: 'doc-1',
            ownerUserId: 'user-1',
            documentType: 'offer_letter',
            originalFilename: overrides.filename,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            checksum: null,
            uploadedAt: '2026-06-01T00:00:00.000Z',
            verifiedAt: null,
            verificationStatus: 'pending',
            rejectionReason: null,
          },
        ]
      : [],
    technologyUsage: [],
  };
}

describe('CSV field escaping', () => {
  it('quotes fields containing commas', () => {
    const csv = toCsv.studentEvidence(
      buildReport({ activities: 'Built the API, wrote tests, reviewed code' }),
    );
    expect(csv).toContain('"Built the API, wrote tests, reviewed code"');
  });

  it('doubles inner quotes', () => {
    const csv = toCsv.studentEvidence(
      buildReport({ activities: 'Used the "strategy" pattern' }),
    );
    expect(csv).toContain('"Used the ""strategy"" pattern"');
  });

  it('quotes fields containing newlines so rows are not split', () => {
    const csv = toCsv.studentEvidence(buildReport({ activities: 'Line one\nLine two' }));
    expect(csv).toContain('"Line one\nLine two"');
  });

  it('leaves plain fields unquoted', () => {
    const csv = toCsv.studentEvidence(buildReport({ studentName: 'Praveen Kumar' }));
    expect(csv).toContain('Praveen Kumar');
    expect(csv).not.toContain('"Praveen Kumar"');
  });

  it('starts with a UTF-8 BOM so Excel reads it as UTF-8', () => {
    const csv = toCsv.studentEvidence(buildReport());
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('separates rows with CRLF per RFC 4180', () => {
    const csv = toCsv.studentEvidence(buildReport());
    expect(csv).toContain('\r\n');
  });
});

describe('CSV formula injection', () => {
  // Each of these is interpreted as a formula by Excel and Google Sheets if written
  // through unmodified. Prefixing with an apostrophe forces text interpretation.
  const dangerous = [
    '=1+1',
    '=HYPERLINK("http://evil.example","click")',
    '+1+1',
    '-1+1',
    '@SUM(A1:A9)',
    '=cmd|\' /C calc\'!A0',
  ];

  for (const payload of dangerous) {
    it(`neutralises a field starting with ${payload.slice(0, 3)}`, () => {
      const csv = toCsv.studentEvidence(buildReport({ activities: payload }));
      // The payload must never appear at the start of a field.
      expect(csv).not.toContain(`,${payload}`);
      // It appears prefixed instead. Fields with a comma are also quoted, so check
      // for the apostrophe immediately before the payload either way.
      expect(csv.includes(`'${payload}`) || csv.includes(`"'${payload.replace(/"/gu, '""')}`)).toBe(
        true,
      );
    });
  }

  it('neutralises a dangerous filename in the documents section', () => {
    const csv = toCsv.studentEvidence(buildReport({ filename: '=cmd()' }));
    expect(csv).toContain("'=cmd()");
  });

  it('neutralises a dangerous student name', () => {
    const csv = toCsv.studentEvidence(buildReport({ studentName: '@evil' }));
    expect(csv).toContain("'@evil");
  });

  it('leaves a negative number that is not leading a field alone', () => {
    // "-5" as a whole field is prefixed, which is the safe trade: a stray apostrophe
    // in a spreadsheet is a cosmetic issue, an executed formula is not.
    const csv = toCsv.studentEvidence(buildReport({ activities: 'Reduced time by -5%' }));
    expect(csv).toContain('Reduced time by -5%');
  });
});

describe('cohort analytics CSV', () => {
  const analytics: CohortAnalytics = {
    studentCount: 3,
    averageAttendancePercentage: 92.4,
    totalHours: 1050.5,
    completionBreakdown: { completed: 2, active: 1 },
    documentCompletenessPercentage: 75,
    averageSkillRatings: [{ skillType: 'communication', average: 4.2 }],
    averageMentorRatings: [{ field: 'Teamwork', average: 4.5 }],
    topTechnologies: [{ technology: 'Python', count: 12 }],
    organisationStats: [{ organisationName: 'Iinvsys Technologies', studentCount: 3 }],
    departmentStats: [{ departmentName: 'Computer Science and Engineering', studentCount: 3 }],
  };

  it('includes every section', () => {
    const csv = toCsv.cohortAnalytics(analytics);
    expect(csv).toContain('Students,3');
    expect(csv).toContain('Average Attendance %,92.4');
    expect(csv).toContain('Total Hours,1050.5');
    expect(csv).toContain('completed,2');
    expect(csv).toContain('Python,12');
    expect(csv).toContain('Teamwork,4.5');
  });

  it('renders a null average as an empty field rather than the string null', () => {
    const csv = toCsv.cohortAnalytics({ ...analytics, averageAttendancePercentage: null });
    expect(csv).toContain('Average Attendance %,\r\n');
    expect(csv).not.toContain('null');
  });
});
