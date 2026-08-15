/**
 * Request and response envelopes.
 *
 * Every response is either `{ data }` or `{ error }`, never both and never a bare
 * value. That means the client unwraps in exactly one place instead of guessing
 * per endpoint, and an error always has the same shape to branch on.
 */

import type { ApiErrorCode, QuestionType, ReviewDecision, SubmissionStatus } from './enums';
import type {
  AttendanceSummary,
  DailySubmission,
  DailySubmissionDetail,
  Department,
  DocumentMeta,
  FacultyDashboard,
  Question,
  Student,
  StudentDashboard,
  StudentListItem,
  TodayForm,
  Uuid,
} from './entities';

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-keyed messages for a validation failure, for inline form display. */
    fields?: Record<string, string>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiList<T> {
  data: T[];
  pagination: Pagination;
}

/** Query parameters accepted by every paginated list endpoint. */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Sign-in and token refresh are handled by the Supabase client in the app, not by
 * this API. What remains server-side is identity resolution (`GET /api/auth/me`)
 * and the two password-reset endpoints, which need the service role.
 */
export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  /** The recovery access token from the emailed link. */
  accessToken: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface CreateQuestionRequest {
  prompt: string;
  helpText?: string | null;
  type?: QuestionType;
  sortOrder?: number;
  required?: boolean;
  options?: string[] | null;
  minLength?: number | null;
  maxLength?: number | null;
  departmentId?: Uuid | null;
  /** Id of an already-uploaded document to attach as a reference file. */
  referenceDocId?: Uuid | null;
}

/** Every field optional: a PATCH updates only what it names. */
export type UpdateQuestionRequest = Partial<CreateQuestionRequest> & {
  isActive?: boolean;
};

export interface QuestionListQuery extends PaginationQuery {
  /** Defaults to active-only. Pass false to include retired questions. */
  activeOnly?: boolean;
  departmentId?: Uuid;
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export interface SubmitAnswersRequest {
  /** Defaults to today. Only accepted inside the allowed window. */
  date?: string;
  answers: AnswerInput[];
  /**
   * Ids of documents already uploaded through the upload-URL flow, to attach to
   * this submission.
   */
  documentIds?: Uuid[];
}

export interface AnswerInput {
  questionId: Uuid;
  answerText: string;
}

export interface ReviewSubmissionRequest {
  decision: ReviewDecision;
  /** Required when declining, so the student knows what to fix. */
  note?: string | null;
}

export interface SubmissionListQuery extends PaginationQuery {
  status?: SubmissionStatus;
  studentId?: Uuid;
  departmentId?: Uuid;
  /** Inclusive `YYYY-MM-DD` bounds. */
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export interface UpdateStudentProfileRequest {
  name?: string;
  programme?: string;
  year?: number | null;
  section?: string | null;
  mobile?: string | null;
  departmentId?: Uuid | null;
}

export interface StudentListQuery extends PaginationQuery {
  departmentId?: Uuid;
  year?: number;
  section?: string;
  /** Matches register number or name. */
  search?: string;
  /** Filter to students who have or have not submitted today. */
  submittedToday?: boolean;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface UploadUrlRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * The client uploads directly to Storage with `uploadUrl`, then calls
 * `POST /api/documents/complete` with `documentId`. Going direct keeps large file
 * bodies off the API server entirely.
 */
export interface UploadUrlResponse {
  documentId: Uuid;
  uploadUrl: string;
  /** Path within the bucket, echoed back on completion. */
  storagePath: string;
  expiresInSeconds: number;
}

export interface CompleteUploadRequest {
  documentId: Uuid;
  /** Optional SHA-256 of the uploaded bytes, recorded for integrity. */
  checksum?: string | null;
  /** Attach immediately, or leave null and attach when the answers are submitted. */
  submissionId?: Uuid | null;
}

export interface DocumentDownloadResponse {
  id: Uuid;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** Short-lived signed URL. */
  downloadUrl: string;
  expiresInSeconds: number;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * One endpoint serves both roles and says which shape it returned, so the client
 * can discriminate on `role` instead of calling a different URL per role.
 */
export type DashboardResponse =
  | { role: 'student'; dashboard: StudentDashboard }
  | { role: 'faculty' | 'admin'; dashboard: FacultyDashboard };

// ---------------------------------------------------------------------------
// Response aliases
// ---------------------------------------------------------------------------
//
// Named so a route handler's return type and the client hook that consumes it
// reference the same symbol.

export type DepartmentListResponse = Department[];
export type QuestionListResponse = Question[];
export type TodayFormResponse = TodayForm;
export type SubmissionDetailResponse = DailySubmissionDetail;
export type SubmissionListResponse = ApiList<DailySubmissionDetail>;
export type SubmissionHistoryResponse = DailySubmission[];
export type StudentListResponse = ApiList<StudentListItem>;
export type StudentDetailResponse = Student;
export type AttendanceSummaryResponse = AttendanceSummary;
export type DocumentListResponse = DocumentMeta[];
