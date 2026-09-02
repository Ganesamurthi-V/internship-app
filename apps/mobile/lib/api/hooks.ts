/**
 * React Query hooks over the API client.
 *
 * Global staleTime is 0 — data always refetches when a screen mounts or the user
 * pulls to refresh. Writes invalidate the specific keys they affect.
 * which is what keeps a submission from blanking the whole screen while it saves.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  AttendanceSummary,
  DailySubmission,
  DailySubmissionDetail,
  DashboardResponse,
  Department,
  DocumentMeta,
  MissedDay,
  Pagination,
  Question,
  RetakeInfo,
  Student,
  StudentListItem,
  SubmissionStatus,
  TodayForm,
} from '@ims/shared-types';
import type {
  CreateQuestionInput,
  GrantRetakeInput,
  ReviewSubmissionInput,
  UpdateQuestionInput,
  UpdateStudentProfileInput,
} from '@ims/shared-validation';
import { api } from './client';
import { queryKeys } from './queryKeys';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * Poll interval for screens that show counters other people change.
 *
 * 15s is a compromise: fast enough that a reviewer approving a submission shows up
 * on the admin's screen while they are still looking at it, slow enough that an
 * idle dashboard costs four requests a minute. Polling stops while the app is
 * backgrounded — see the AppState wiring in `app/_layout.tsx`.
 */
export const LIVE_REFETCH_INTERVAL_MS = 15_000;

export function useDashboard(options?: Partial<UseQueryOptions<DashboardResponse>>) {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardResponse>('/dashboard'),
    // Every number here is a live aggregate of what students and reviewers are
    // doing right now, so it refreshes on its own rather than waiting for a pull.
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Today's form — the student's main screen
// ---------------------------------------------------------------------------

/**
 * The student's form for one day.
 *
 * Omitting `date` is not the same as passing today's: it sends no date at all and
 * lets the server resolve "today" on the institution clock. That matters because the
 * device's own date is read in UTC, so between midnight and 05:30 IST it names
 * yesterday — and asking for yesterday returns a closed form. A date is passed
 * explicitly only when the student is deliberately looking at another day, such as a
 * granted retake.
 *
 * Kept short-lived: whether a day is still open can change while the app is open, and
 * a stale "you can still submit" is the one thing worth a refetch.
 */
export function useTodayForm(date?: string) {
  return useQuery({
    queryKey: queryKeys.submissions.today(date ?? 'server-today'),
    queryFn: () => api.get<TodayForm>('/submissions/today', date ? { date } : undefined),
  });
}

export function useSubmitAnswers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      date?: string;
      answers: { questionId: string; answerText: string }[];
      documentIds?: string[];
    }) => api.post<DailySubmissionDetail>('/submissions', input),

    onSuccess: () => {
      // The submission changes today's form, the dashboard counters, and the
      // submission list. Invalidate by prefix rather than naming each.
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export function useSubmissionList(filters: {
  status?: SubmissionStatus;
  studentId?: string;
  from?: string;
  to?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: queryKeys.submissions.list(filters),
    queryFn: () =>
      api.list<DailySubmissionDetail>('/submissions', {
        status: filters.status,
        studentId: filters.studentId,
        from: filters.from,
        to: filters.to,
        page: filters.page ?? 1,
      }),
  });
}

export function useSubmission(submissionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.submissions.detail(submissionId ?? 'none'),
    enabled: Boolean(submissionId),
    queryFn: () => api.get<DailySubmissionDetail>(`/submissions/${submissionId}`),
  });
}

export function useReviewSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { submissionId: string } & ReviewSubmissionInput) =>
      api.post<DailySubmissionDetail>(`/submissions/${input.submissionId}/review`, {
        decision: input.decision,
        note: input.note ?? null,
      }),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      // A decision changes the student's approval percentage in the directory too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useBulkReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      submissionIds: string[];
      decision: 'approved' | 'declined';
      note?: string | null;
    }) =>
      api.post<{ requested: number; updated: number; skipped: number }>(
        '/submissions/review',
        input,
      ),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Pending registrations
// ---------------------------------------------------------------------------

/**
 * A student registration awaiting approval.
 *
 * Shaped by `/api/students/pending`, which builds its payload inline rather than from a
 * shared serializer, so this mirrors that route by hand.
 */
export interface PendingStudent {
  id: string;
  registerNumber: string;
  name: string;
  programme: string;
  departmentName: string | null;
  year: number | null;
  section: string | null;
  email: string;
  mobile: string;
  organisationName: string | null;
  organisationLocation: string | null;
  internshipDomain: string | null;
  internshipMode: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  workingHoursPerDay: number | null;
  mentorName: string | null;
  mentorDesignation: string | null;
  mentorContact: string | null;
  facultyCoordinator: string | null;
  offerLetterDocId: string | null;
  joiningLetterDocId: string | null;
  status: string;
  createdAt: string;
}

/**
 * Registrations awaiting the caller's approval.
 *
 * Deliberately sourced from the pending *list* rather than from a count on the dashboard
 * payload. The list endpoint already exists and is already deployed, so the badges that
 * depend on it work without waiting on a backend release — and because the approvals
 * screen uses this same hook, the count on the dashboard and the rows on that screen
 * come from one cache entry and cannot disagree.
 */
export function usePendingStudents() {
  return useQuery({
    queryKey: queryKeys.students.pending,
    queryFn: () => api.get<PendingStudent[]>('/students/pending'),
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Retakes
// ---------------------------------------------------------------------------

/**
 * Retake grants in scope. A student always gets only their own, whatever they ask
 * for — the server pins that, so no filter is needed here.
 */
export function useRetakes(filters: { studentId?: string; includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.retakes.list(filters),
    queryFn: () =>
      api.get<RetakeInfo[]>('/retakes', {
        studentId: filters.studentId,
        includeInactive: filters.includeInactive,
      }),
  });
}

/**
 * The days a reviewer could reopen for one student: every elapsed internship day
 * not counted present, newest first.
 */
export function useMissedDays(studentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.retakes.missedDays(studentId ?? 'none'),
    enabled: Boolean(studentId),
    queryFn: () => api.get<MissedDay[]>(`/students/${studentId}/missed-days`),
  });
}

/**
 * Every retake write invalidates the submission and student trees as well as the
 * retake list. Reopening a day changes what the student's form will accept and, once
 * they answer and it is approved, their attendance percentage in the directory — so
 * the same trio the review mutations invalidate applies here.
 */
function invalidateAfterRetakeChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.retakes.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
}

export function useGrantRetake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GrantRetakeInput) => api.post<RetakeInfo>('/retakes', input),
    onSuccess: () => invalidateAfterRetakeChange(queryClient),
  });
}

export function useRevokeRetake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (retakeId: string) => api.delete<RetakeInfo>(`/retakes/${retakeId}`),
    onSuccess: () => invalidateAfterRetakeChange(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function useQuestions(activeOnly = true) {
  return useQuery({
    queryKey: queryKeys.questions.list(activeOnly),
    queryFn: () => api.get<Question[]>('/questions', { activeOnly }),
  });
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateQuestionInput) => api.post<Question>('/questions', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.questions.all });
      // The dashboard shows the active question count.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { questionId: string } & UpdateQuestionInput) => {
      const { questionId, ...body } = input;
      return api.patch<Question>(`/questions/${questionId}`, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.questions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (questionId: string) =>
      api.delete<{ deleted: boolean; message: string }>(`/questions/${questionId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.questions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useReorderQuestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (order: { id: string; sortOrder: number }[]) =>
      api.patch<Question[]>('/questions/reorder', { order }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.questions.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.students.me,
    queryFn: () => api.get<Student>('/students/me'),
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateStudentProfileInput) => api.patch<Student>('/students/me', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useStudentList(filters: {
  search?: string;
  year?: number;
  section?: string;
  submittedToday?: boolean;
  page?: number;
}) {
  return useQuery({
    queryKey: queryKeys.students.list(filters),
    queryFn: () =>
      api.list<StudentListItem>('/students', {
        search: filters.search,
        year: filters.year,
        section: filters.section,
        submittedToday: filters.submittedToday,
        page: filters.page ?? 1,
      }),
  });
}

/** One student plus their summary and history, as the detail screen needs it. */
export function useStudentDetail(studentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.students.detail(studentId ?? 'none'),
    enabled: Boolean(studentId),
    queryFn: () =>
      api.get<{ student: Student; summary: AttendanceSummary; history: DailySubmission[] }>(
        `/students/${studentId}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Files uploaded but not yet attached — the staging list on the daily form. */
export function useUnattachedDocuments() {
  return useQuery({
    queryKey: queryKeys.documents.unattached,
    queryFn: () => api.get<DocumentMeta[]>('/documents'),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => api.delete<void>(`/documents/${documentId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.unattached });
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.reference.departments,
    // Departments change at most once a semester.
    staleTime: 60 * 60 * 1000,
    // Anonymous: the student registration form needs this before a session exists.
    queryFn: () => api.anonymous.get<Department[]>('/departments'),
  });
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Pagination };
