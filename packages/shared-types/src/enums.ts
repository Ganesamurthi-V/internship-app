/**
 * Enumerations shared by the API and the app.
 *
 * Each is declared as a `readonly` tuple with the union type derived from it, so a
 * single declaration gives both a runtime value list (for Zod schemas, pickers and
 * validation) and a compile-time union. Adding a member in one place updates both.
 *
 * The string values match the Postgres enum labels in `prisma/schema.prisma`
 * exactly, so no translation layer is needed at the database boundary.
 */

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * `admin` is faculty with institution-wide scope rather than a separate feature
 * set, so capability checks accept both and only the data scope differs.
 */
export const USER_ROLES = ['student', 'faculty', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  faculty: 'Faculty',
  admin: 'Admin',
};

/** Roles allowed to review submissions and manage questions. */
export const REVIEWER_ROLES = ['faculty', 'admin'] as const;
export type ReviewerRole = (typeof REVIEWER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  pending: 'Pending',
};

/** Recorded on audit rows so a change can be traced to where it came from. */
export const CLIENT_PLATFORMS = ['ios', 'android', 'web'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

/**
 * Review state of a day's submission.
 *
 * A student's submission always lands in `pending`; only a reviewer moves it out.
 * `approved` is what makes the day count as attended.
 */
export const SUBMISSION_STATUSES = ['pending', 'approved', 'declined'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  declined: 'Declined',
};

/** Statuses a reviewer can move a pending submission into. */
export const REVIEW_DECISIONS = ['approved', 'declined'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * How a question's answer is captured and validated.
 *
 * `long_text` is the default and renders a multiline field; `text` is a single
 * line; `number` accepts a numeric string; `choice` requires the answer to be one
 * of the question's `options`.
 */
export const QUESTION_TYPES = ['text', 'long_text', 'number', 'choice', 'file_upload'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Short text',
  long_text: 'Paragraph',
  number: 'Number',
  choice: 'Choice',
  file_upload: 'File upload',
};

// ---------------------------------------------------------------------------
// API errors
// ---------------------------------------------------------------------------

/**
 * Error codes the client branches on.
 *
 * The message is for humans; the code is the contract, so rewording a message
 * never breaks client behaviour.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'SERVER_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * The HTTP status each code maps to.
 *
 * Declared once here so a handler cannot throw `NOT_FOUND` and accidentally
 * return 400. `satisfies` keeps the map exhaustive: adding a code without a
 * status becomes a compile error.
 */
export const API_ERROR_STATUS = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SERVER_ERROR: 500,
} as const satisfies Record<ApiErrorCode, number>;

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/**
 * Every auditable event.
 *
 * Enumerated rather than free text so a typo cannot silently create a new action
 * name that no report will ever find.
 */
export const AUDIT_ACTIONS = [
  'login_success',
  'login_failed',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'student_profile_updated',
  'question_created',
  'question_updated',
  'question_deleted',
  'questions_reordered',
  'submission_created',
  'submission_updated',
  'submission_approved',
  'submission_declined',
  'submission_deleted',
  'document_uploaded',
  'document_deleted',
  'document_downloaded',
  'user_created',
  'user_role_changed',
  'user_status_changed',
  'settings_changed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
