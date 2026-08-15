/**
 * Entity shapes as they cross the API boundary.
 *
 * These describe what a *response* looks like, not what the database row looks
 * like. Two consequences:
 *
 *  - Dates are strings. `DateOnly` marks `YYYY-MM-DD` values, `Timestamp` marks
 *    full ISO instants. Serialising at the boundary means the client never has to
 *    guess whether a field is a `Date` or a string.
 *  - Server-only columns are absent. `documents.storage_key` is the clearest case:
 *    it exists on the row and must never reach a client.
 */

import type {
  ClientPlatform,
  QuestionType,
  SubmissionStatus,
  UserRole,
  UserStatus,
} from './enums';

/** RFC 4122 UUID. */
export type Uuid = string;
/** Calendar date with no time or zone, `YYYY-MM-DD`. */
export type DateOnly = string;
/** ISO 8601 instant, e.g. `2026-08-17T09:30:00.000Z`. */
export type Timestamp = string;

// ---------------------------------------------------------------------------
// Users and institution
// ---------------------------------------------------------------------------

export interface Department {
  id: Uuid;
  name: string;
  institution: string;
  createdAt: Timestamp;
}

/**
 * The signed-in user's identity, returned by `GET /api/auth/me`.
 *
 * `studentId` is present only for students and is what every student-scoped
 * endpoint keys off, so the client never has to send it.
 */
export interface AuthenticatedUser {
  id: Uuid;
  email: string;
  role: UserRole;
  name: string;
  status: UserStatus;
  departmentId: Uuid | null;
  /** Present only when `role === 'student'`. */
  studentId?: Uuid | null;
}

export interface Student {
  id: Uuid;
  userId: Uuid;
  registerNumber: string;
  name: string;
  programme: string;
  departmentId: Uuid | null;
  department: Department | null;
  year: number | null;
  section: string | null;
  studentEmail: string;
  /**
   * Omitted unless the caller is the student themselves or a reviewer. Contact
   * details are the one field on this record that is not needed to do the job.
   */
  mobile?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface Question {
  id: Uuid;
  prompt: string;
  helpText: string | null;
  type: QuestionType;
  sortOrder: number;
  isActive: boolean;
  required: boolean;
  /** Populated only when `type === 'choice'`. */
  options: string[] | null;
  minLength: number | null;
  maxLength: number | null;
  /** Null means the question applies to every department. */
  departmentId: Uuid | null;
  /** An optional reference file (PDF, image) attached to the question. */
  referenceDoc: { id: Uuid; originalFilename: string; mimeType: string; sizeBytes: number } | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * A file attached to a submission. `storageKey` is deliberately absent — it is
 * server-only, and a download goes through a short-lived signed URL instead.
 */
export interface DocumentMeta {
  id: Uuid;
  submissionId: Uuid | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export interface Answer {
  id: Uuid;
  questionId: Uuid;
  /**
   * The prompt as it read when answered. Kept alongside the live question so a
   * later edit to the question does not silently rewrite past history.
   */
  promptSnapshot: string;
  answerText: string;
}

/**
 * One day's submission. Its existence means the student answered; `status ===
 * 'approved'` is what makes the day count as attended.
 */
export interface DailySubmission {
  id: Uuid;
  studentId: Uuid;
  submissionDate: DateOnly;
  status: SubmissionStatus;
  submittedAt: Timestamp;
  reviewedAt: Timestamp | null;
  /** Carries the decline reason so the student knows what to fix. */
  reviewNote: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A submission with everything needed to review it, in one response. */
export interface DailySubmissionDetail extends DailySubmission {
  answers: Answer[];
  documents: DocumentMeta[];
  /** Present for reviewers so a list does not need a second call per row. */
  student?: SubmissionStudentSummary;
  /** Display name of the reviewer, when reviewed. */
  reviewedByName?: string | null;
}

/** The slice of a student record a reviewer needs next to a submission. */
export interface SubmissionStudentSummary {
  id: Uuid;
  registerNumber: string;
  name: string;
  programme: string;
  departmentName: string | null;
  year: number | null;
  section: string | null;
}

// ---------------------------------------------------------------------------
// Today's form
// ---------------------------------------------------------------------------

/**
 * Everything the student's daily screen needs, in one call: the questions to
 * answer, whether today is still open, and the existing submission if any.
 */
export interface TodayForm {
  date: DateOnly;
  questions: Question[];
  /** Null until the student has submitted for this date. */
  submission: DailySubmissionDetail | null;
  /**
   * Whether the form accepts a write right now. False once approved, or when the
   * date is outside the allowed window.
   */
  canSubmit: boolean;
  /** Why `canSubmit` is false, for display. Null when it is true. */
  lockedReason: string | null;
}

// ---------------------------------------------------------------------------
// Attendance summary — derived from submissions, not stored
// ---------------------------------------------------------------------------

/**
 * Counts computed from a student's submissions. There is no attendance table; a
 * day is attended when an approved submission exists for it, so these numbers
 * cannot disagree with the submission list.
 */
export interface AttendanceSummary {
  /** Days with an approved submission. */
  daysApproved: number;
  /** Days submitted and awaiting review. */
  daysPending: number;
  /** Days submitted and declined. */
  daysDeclined: number;
  /** Distinct days with any submission. */
  daysSubmitted: number;
  /** `daysApproved / daysSubmitted`, rounded to one decimal. Null with no data. */
  approvalPercentage: number | null;
  firstSubmissionDate: DateOnly | null;
  lastSubmissionDate: DateOnly | null;
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

export interface StudentDashboard {
  student: Student;
  today: {
    date: DateOnly;
    /** Whether a submission exists for today. */
    submitted: boolean;
    status: SubmissionStatus | null;
    /** How many active questions today's form has. */
    questionCount: number;
  };
  summary: AttendanceSummary;
  /** Most recent submissions, newest first, for the history preview. */
  recentSubmissions: DailySubmission[];
}

export interface FacultyDashboard {
  /** Submissions awaiting review inside the caller's scope. */
  pendingReview: number;
  /** Submitted for today. */
  submittedToday: number;
  /** Active students in scope who have not submitted today. */
  missingToday: number;
  approvedToday: number;
  declinedToday: number;
  totalStudents: number;
  activeQuestions: number;
}

/** One row of the faculty student list. */
export interface StudentListItem {
  id: Uuid;
  registerNumber: string;
  name: string;
  programme: string;
  departmentName: string | null;
  year: number | null;
  section: string | null;
  /** Whether they submitted for today. */
  submittedToday: boolean;
  todayStatus: SubmissionStatus | null;
  summary: AttendanceSummary;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: Uuid;
  actorUserId: Uuid | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId: Uuid | null;
  clientPlatform: ClientPlatform | null;
  clientVersion: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
}
