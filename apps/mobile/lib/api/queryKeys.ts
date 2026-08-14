/**
 * React Query keys — 12_Mobile_App_Spec §4.
 *
 * Transcribed from the specification, with a few additions for endpoints the app needs
 * that the original list did not cover (dashboard, documents, notifications).
 *
 * `as const` throughout so each key is a readonly tuple, which is what lets
 * `invalidateQueries` match by prefix reliably.
 */

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },

  dashboard: ['dashboard'] as const,

  student: {
    me: ['student', 'me'] as const,
    internship: (studentId: string) => ['internship', studentId] as const,
    myInternship: ['internship', 'me'] as const,
    attendance: (internshipId: string, from: string, to: string) =>
      ['attendance', internshipId, from, to] as const,
    attendanceAll: (internshipId: string) => ['attendance', internshipId] as const,
    attendanceSummary: (internshipId: string) =>
      ['attendance', 'summary', internshipId] as const,
    workLog: (internshipId: string, date: string) => ['work-log', internshipId, date] as const,
    workLogs: (internshipId: string) => ['work-log', internshipId] as const,
    weeklyReports: (internshipId: string) => ['weekly-reports', internshipId] as const,
    currentWeek: (internshipId: string) => ['weekly-reports', 'current', internshipId] as const,
    finalAssessment: (internshipId: string) => ['final-assessment', internshipId] as const,
    documents: (internshipId: string) => ['documents', internshipId] as const,
  },

  faculty: {
    students: (filters: object) => ['faculty', 'students', filters] as const,
    student: (studentId: string) => ['faculty', 'student', studentId] as const,
    evidence: (internshipId: string) => ['faculty', 'evidence', internshipId] as const,
    analytics: (filters: object) => ['faculty', 'analytics', filters] as const,
  },

  mentor: {
    students: ['mentor', 'students'] as const,
    evaluation: (internshipId: string) => ['mentor', 'evaluation', internshipId] as const,
  },

  reference: {
    departments: ['reference', 'departments'] as const,
    organisations: (search?: string) => ['reference', 'organisations', search ?? ''] as const,
    facultyCoordinators: ['reference', 'faculty-coordinators'] as const,
  },

  notifications: (unreadOnly: boolean) => ['notifications', unreadOnly] as const,
} as const;
