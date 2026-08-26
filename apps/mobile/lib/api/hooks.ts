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
  Pagination,
  Question,
  Student,
  StudentListItem,
  SubmissionStatus,
  TodayForm,
} from '@ims/shared-types';
import type {
  CreateQuestionInput,
  ReviewSubmissionInput,
  UpdateQuestionInput,
  UpdateStudentProfileInput,
} from '@ims/shared-validation';
import { api } from './client';
import { queryKeys } from './queryKeys';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function useDashboard(options?: Partial<UseQueryOptions<DashboardResponse>>) {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardResponse>('/dashboard'),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Today's form — the student's main screen
// ---------------------------------------------------------------------------

/**
 * `date` is passed explicitly so the key changes when the student looks at another
 * day. Kept short-lived: whether today is still open can change while the app is
 * open, and a stale "you can still submit" is the one thing worth a refetch.
 */
export function useTodayForm(date: string) {
  return useQuery({
    queryKey: queryKeys.submissions.today(date),
    queryFn: () => api.get<TodayForm>('/submissions/today', { date }),
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
