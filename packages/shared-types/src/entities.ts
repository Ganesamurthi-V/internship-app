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
  InternshipDomain,
  InternshipMode,
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
  mobile: string;

  // Internship details
  organisationName: string | null;
  organisationLocation: string | null;
  internshipDomain: InternshipDomain | null;
  internshipMode: InternshipMode | null;
  startDate: DateOnly | null;
  endDate: DateOnly | null;
  durationDays: number | null;
  workingHoursPerDay: number | null;
  /**
   * Weekdays this student is expected to answer on, 0 = Sunday, sorted ascending.
   *
   * Attendance is measured only against these days. Always populated — the column is
   * defaulted to Monday-to-Friday, so a student registered before working days were
   * configurable reads as a five-day week rather than as no week at all.
   */
  workingDays: number[];
  mentorName: string | null;
  mentorDesignation: string | null;
  mentorContact: string | null;
  facultyCoordinator: string | null;

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
  /**
   * For a `file_upload` question this holds the document id, not prose. Clients
   * should render `document` instead of this value — see `questionType`.
   */
  answerText: string;
  /**
   * The question's type at read time, so a client can render the answer without a
   * second lookup. Without it a `file_upload` answer displays as a bare UUID.
   */
  questionType?: QuestionType;
  /**
   * The uploaded file, for a `file_upload` answer. Null when the question is not a
   * file upload, or when the referenced document is missing or deleted.
   */
  document?: DocumentMeta | null;
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
// Retakes
// ---------------------------------------------------------------------------

/**
 * A faculty-granted second chance at one closed day.
 *
 * A missed day is absent and the day cannot be reopened by the student, so this is
 * the only route back. The grant names its reason and its deadline because the
 * student is shown both: an unexplained reopened day, or one with no visible
 * deadline, is worse than no second chance at all.
 */
export interface RetakeInfo {
  id: Uuid;
  /** The closed day this reopens. */
  targetDate: DateOnly;
  /** Null if the granting account has since been removed. */
  grantedByName: string | null;
  grantedAt: Timestamp;
  reason: string | null;
  /** Last day the student may use it, inclusive. */
  expiresOn: DateOnly;
  /** When the student first submitted under it. Still usable until it expires. */
  usedAt: Timestamp | null;
  revokedAt: Timestamp | null;
  /** False once revoked or expired. Computed server-side against the institution clock. */
  isActive: boolean;
}

/**
 * A day the student did not get approved, offered to faculty as a retake candidate.
 *
 * `status` is why the day is not counted present: `missing` means nothing was ever
 * submitted, the other two mean something was but it does not count yet.
 */
export interface MissedDay {
  date: DateOnly;
  status: 'missing' | 'declined' | 'pending';
  /** The existing grant for this day, if one has already been given. */
  retake: RetakeInfo | null;
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
  /**
   * The grant reopening this date, when there is one. Present so the form can say
   * the day is open *because* faculty allowed it, rather than looking like the
   * deadline never existed.
   */
  retake: RetakeInfo | null;
}

// ---------------------------------------------------------------------------
// Attendance summary — derived from submissions, not stored
// ---------------------------------------------------------------------------

/**
 * Counts computed from a student's submissions. There is no attendance table; a day
 * is attended unless an approved submission is missing for it, so these numbers
 * cannot disagree with the submission list.
 *
 * ATTENDANCE RULE
 *
 * A student starts at 100% and loses ground only by missing a day. The denominator is
 * `internshipDays` — the working days in their whole internship — and the percentage
 * is `100 - (daysAbsent / internshipDays)`. Three consequences are deliberate:
 *
 *   - Day one is 100%, not 0%. Measuring approvals over elapsed days would open every
 *     internship at zero and climb, which reads as failure on the first morning.
 *   - A pending day is *not* absent. The student answered inside the window; whether a
 *     reviewer has got to it yet is not their conduct. Counting it against them would
 *     make the percentage sag every evening and recover on approval.
 *   - Only a day that closed without an approved answer costs anything, and a
 *     faculty-granted retake that gets approved gives it straight back.
 *
 * Days outside the student's chosen working days are not counted at all — not as
 * present, not as absent, and not in the denominator. A student cannot be marked
 * absent for a Sunday nobody expected them to work.
 */
export interface AttendanceSummary {
  /**
   * Working days in the whole internship, start date through end date. The
   * denominator.
   *
   * When no end date is recorded there is no way to know the length, so this falls
   * back to the working days elapsed so far. That keeps the percentage meaningful,
   * at the cost of a single missed day weighing much more early on.
   */
  internshipDays: number;
  /**
   * Working days that have closed: start date through yesterday, clipped at the end
   * date. Today is excluded because it is still answerable.
   */
  elapsedDays: number;
  /** Closed working days with an approved submission. */
  daysApproved: number;
  /** Working days answered and awaiting review. Not counted absent. */
  daysPending: number;
  /** Closed working days answered but declined. Counted absent. */
  daysDeclined: number;
  /** Closed working days with nothing submitted at all. Counted absent. */
  daysNotAnswered: number;
  /**
   * The days subtracted from 100%: `daysDeclined + daysNotAnswered`.
   *
   * Always a number, never null — a student with nothing missed is absent 0 days, and
   * the UI shows that 0 rather than a blank.
   */
  daysAbsent: number;
  /**
   * Absent days a faculty retake is currently open on, so the student can still
   * recover them. A subset of `daysAbsent`, not an addition to it.
   */
  daysRecoverable: number;
  /** Distinct working days with any submission, whatever its status. */
  daysSubmitted: number;
  /**
   * `100 - (daysAbsent / internshipDays) * 100`, rounded to one decimal.
   *
   * Null only when the internship has no measurable length yet — no start date and no
   * submissions — where any number would be invented.
   */
  attendancePercentage: number | null;
  /** The weekdays this was measured against, 0 = Sunday. For display. */
  workingDays: number[];
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
  /**
   * Usable retake grants, soonest deadline first. On the dashboard rather than
   * behind a separate call because a grant the student never notices is a grant
   * that expires unused.
   */
  retakes: RetakeInfo[];
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
  /**
   * Every student in scope, whatever their account status. Includes pending
   * registrations awaiting approval, so the header does not read "no students" while
   * a registration is sitting unactioned.
   */
  totalStudents: number;
  /**
   * Students in scope whose account is still pending approval. Surfaced separately so
   * the dashboard can prompt the reviewer to act on new registrations.
   */
  pendingStudents: number;
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
