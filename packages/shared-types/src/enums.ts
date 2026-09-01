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
// Working days
// ---------------------------------------------------------------------------

/**
 * The weekdays a student is expected to answer on, chosen per student at registration.
 *
 * Numbered to match `Date.prototype.getUTCDay`: 0 is Sunday through 6 is Saturday.
 * Using the platform's own numbering rather than a prettier Monday-first scheme means
 * `dayOfWeek(date)` can be compared against these directly, with no offset arithmetic
 * anywhere — and an off-by-one in that arithmetic would silently misattribute a whole
 * category of days.
 *
 * This exists because attendance is measured against internship days, and a student
 * cannot be marked absent for a Sunday their institution never expected them to work.
 * Which days those are varies by institution and by placement, so it is stored per
 * student instead of hard-coded.
 */
export const WORKING_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type WorkingDay = (typeof WORKING_DAYS)[number];

/** Full names, for prose. Indexed by day number. */
export const WORKING_DAY_LABELS: Record<WorkingDay, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/** Three-letter names, for the registration picker and dense summaries. */
export const WORKING_DAY_SHORT_LABELS: Record<WorkingDay, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/**
 * Picker order: Monday first, Sunday last.
 *
 * Deliberately separate from `WORKING_DAYS`, whose order is fixed by the platform's
 * day numbering. A week that reads Sun-first in the UI is the kind of small wrongness
 * students notice, and reordering the numeric constant to fix it would break the
 * direct comparison that numbering exists for.
 */
export const WORKING_DAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * Monday to Friday.
 *
 * Applied to students registered before working days were configurable, and offered
 * as the pre-selected default at registration. It is the most common pattern rather
 * than a universal one — an institution running six-day weeks changes it per student
 * at registration, or in bulk.
 */
export const DEFAULT_WORKING_DAYS: readonly WorkingDay[] = [1, 2, 3, 4, 5];

/** Whether `value` is a valid day number. Narrows for callers reading stored data. */
export function isWorkingDayNumber(value: number): value is WorkingDay {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * `[1,2,3,4,5]` → `Mon-Fri`; `[1,3,5]` → `Mon, Wed, Fri`.
 *
 * Consecutive runs are collapsed into ranges because the common cases (Mon-Fri,
 * Mon-Sat) are the ones students read most often, and "Mon, Tue, Wed, Thu, Fri, Sat"
 * is noise where "Mon-Sat" is a fact.
 */
export function describeWorkingDays(days: readonly number[]): string {
  const valid = [...new Set(days)].filter(isWorkingDayNumber);
  if (valid.length === 0) return 'No working days set';
  if (valid.length === 7) return 'Every day';

  // Ordered Monday-first so a Mon-Fri week reads as one run rather than being split
  // by Sunday sitting at position 0.
  const ordered = WORKING_DAY_PICKER_ORDER.filter((day) => valid.includes(day));

  const runs: WorkingDay[][] = [];
  for (const day of ordered) {
    const currentRun = runs[runs.length - 1];
    const previous = currentRun?.[currentRun.length - 1];

    // A run continues only along the picker order, so Sat→Sun does not merge.
    if (
      currentRun &&
      previous !== undefined &&
      WORKING_DAY_PICKER_ORDER.indexOf(day) === WORKING_DAY_PICKER_ORDER.indexOf(previous) + 1
    ) {
      currentRun.push(day);
    } else {
      runs.push([day]);
    }
  }

  return runs
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      if (first === undefined || last === undefined) return '';
      // A two-day run reads better listed than hyphenated: "Mon, Tue" not "Mon-Tue".
      if (run.length <= 2) {
        return run.map((day) => WORKING_DAY_SHORT_LABELS[day]).join(', ');
      }
      return `${WORKING_DAY_SHORT_LABELS[first]}\u2013${WORKING_DAY_SHORT_LABELS[last]}`;
    })
    .filter((part) => part.length > 0)
    .join(', ');
}

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
// Internship details (on student registration)
// ---------------------------------------------------------------------------

export const INTERNSHIP_DOMAINS = [
  'software_development',
  'data_science_ai_ml',
  'cyber_security',
  'cloud_computing',
  'networking',
  'web_development',
  'business_management',
  'other',
] as const;
export type InternshipDomain = (typeof INTERNSHIP_DOMAINS)[number];

export const INTERNSHIP_DOMAIN_LABELS: Record<InternshipDomain, string> = {
  software_development: 'Software Development',
  data_science_ai_ml: 'Data Science / AI / ML',
  cyber_security: 'Cyber Security',
  cloud_computing: 'Cloud Computing',
  networking: 'Networking',
  web_development: 'Web Development',
  business_management: 'Business / Management',
  other: 'Other',
};

export const INTERNSHIP_MODES = ['offline', 'online', 'hybrid'] as const;
export type InternshipMode = (typeof INTERNSHIP_MODES)[number];

export const INTERNSHIP_MODE_LABELS: Record<InternshipMode, string> = {
  offline: 'Offline',
  online: 'Online',
  hybrid: 'Hybrid',
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
  // Reopening a closed day changes attendance, so each step is recorded.
  'retake_granted',
  'retake_revoked',
  'retake_used',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
