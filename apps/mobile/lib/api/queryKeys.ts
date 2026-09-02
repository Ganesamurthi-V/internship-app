/**
 * React Query keys.
 *
 * `as const` throughout, so each key is a readonly tuple. That is what lets
 * `invalidateQueries` match by prefix reliably — invalidating `['submissions']`
 * catches every submission list and detail without naming them.
 */

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },

  dashboard: ['dashboard'] as const,

  questions: {
    all: ['questions'] as const,
    list: (activeOnly: boolean) => ['questions', 'list', activeOnly] as const,
    detail: (questionId: string) => ['questions', questionId] as const,
  },

  submissions: {
    all: ['submissions'] as const,
    /** The student's daily form for a given date. */
    today: (date: string) => ['submissions', 'today', date] as const,
    list: (filters: object) => ['submissions', 'list', filters] as const,
    detail: (submissionId: string) => ['submissions', submissionId] as const,
    history: ['submissions', 'history'] as const,
  },

  students: {
    all: ['students'] as const,
    me: ['students', 'me'] as const,
    list: (filters: object) => ['students', 'list', filters] as const,
    detail: (studentId: string) => ['students', studentId] as const,
    /** Registrations awaiting approval. Shared by the approvals screen and the badges. */
    pending: ['students', 'pending'] as const,
  },

  retakes: {
    all: ['retakes'] as const,
    list: (filters: object) => ['retakes', 'list', filters] as const,
    /** Candidate days a reviewer could reopen for one student. */
    missedDays: (studentId: string) => ['retakes', 'missed-days', studentId] as const,
  },

  documents: {
    /** Files uploaded but not yet attached to a submission. */
    unattached: ['documents', 'unattached'] as const,
  },

  reference: {
    departments: ['reference', 'departments'] as const,
  },
} as const;
