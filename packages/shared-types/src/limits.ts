/**
 * Security, rate-limit and policy constants.
 *
 * Centralised so the backend limiter and the app's optimistic checks cannot drift
 * apart: both import the same number.
 */

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/**
 * Minimum 8 characters, at least one uppercase letter and one number.
 *
 * Supabase Auth owns hashing and storage; this is only used to validate input
 * before a request is made, so the user sees the rule before a round trip.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_POLICY_DESCRIPTION =
  'At least 8 characters, including one uppercase letter and one number.';

// ---------------------------------------------------------------------------
// Presigned URL TTLs
// ---------------------------------------------------------------------------

/** Long enough to finish an upload on a slow connection, short enough to not be a credential. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// File uploads
// ---------------------------------------------------------------------------

/** 10 MB. Enforced by the Storage bucket, a CHECK constraint, and the validators. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Files a student may attach to one day's submission. */
export const MAX_FILES_PER_SUBMISSION = 5;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * Default answer bounds, used when a question does not set its own. The floor
 * exists so "ok" cannot satisfy a reflective question; the ceiling keeps a single
 * answer from becoming a document.
 */
export const ANSWER_MIN_LENGTH = 10;
export const ANSWER_MAX_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Answer length in words
// ---------------------------------------------------------------------------

/**
 * The written limits on a text answer are word counts, not character counts.
 *
 * Words are what a student is actually asked for ("write 100 words on what you did
 * today"), and a character budget is impossible to plan against while typing — the same
 * paragraph passes or fails depending on how long the words in it happen to be.
 *
 * The floor matters as much as the ceiling: it is what stops "did some work" from
 * satisfying a reflective question, which is the whole point of asking one.
 */
export const SHORT_ANSWER_MIN_WORDS = 10;
export const SHORT_ANSWER_MAX_WORDS = 100;
export const LONG_ANSWER_MIN_WORDS = 30;
export const LONG_ANSWER_MAX_WORDS = 200;

/**
 * Absolute ceiling on one answer, in characters.
 *
 * Not a writing rule — the writing rule is the word count above, and this is set far
 * beyond any realistic answer so it never fires for a student writing normally. It
 * exists only so a single answer cannot be megabytes of text: the word counter splits
 * on whitespace, so one continuous string with no spaces counts as a single word no
 * matter how long it is, and without this that would be unbounded.
 */
export const ANSWER_HARD_MAX_LENGTH = 10_000;

/** Inclusive word bounds for a free-text answer. */
export interface AnswerWordBounds {
  readonly min: number;
  readonly max: number;
}

/**
 * Word bounds for a question type, or null when the type is not free text.
 *
 * Returned as a pair rather than through two separate lookups so a caller cannot read
 * the minimum for one type and the maximum for another — the validator and the on-screen
 * counter both depend on getting a matched set.
 *
 * Derived from the type rather than stored per question, because the bounds are a
 * property of what "short" and "long" mean rather than something an author picks per
 * prompt. Typed loosely on the input so callers holding a raw string from the database do
 * not have to assert it first.
 */
export function wordBoundsForQuestionType(type: string): AnswerWordBounds | null {
  if (type === 'text') {
    return { min: SHORT_ANSWER_MIN_WORDS, max: SHORT_ANSWER_MAX_WORDS };
  }
  if (type === 'long_text') {
    return { min: LONG_ANSWER_MIN_WORDS, max: LONG_ANSWER_MAX_WORDS };
  }
  return null;
}

/** Bounds a question author may choose between. */
export const QUESTION_PROMPT_MAX_LENGTH = 500;
export const QUESTION_HELP_TEXT_MAX_LENGTH = 300;
export const MAX_QUESTION_OPTIONS = 10;
export const QUESTION_OPTION_MAX_LENGTH = 100;

/** Guards the daily form against an unusable number of questions. */
export const MAX_ACTIVE_QUESTIONS = 20;

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/** A decline must explain itself; this is the bound on that explanation. */
export const REVIEW_NOTE_MIN_LENGTH = 5;
export const REVIEW_NOTE_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// API rate limits
// ---------------------------------------------------------------------------

export interface RateLimitRule {
  /** Maximum requests allowed inside the window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
  /** Whether the counter is keyed by client IP or authenticated user id. */
  readonly keyBy: 'ip' | 'user';
}

export const RATE_LIMITS = {
  /** Auth endpoints: 10/min per IP. */
  auth: { limit: 10, windowSeconds: 60, keyBy: 'ip' },
  /** Upload URL generation: 30/min per user. */
  uploadUrl: { limit: 30, windowSeconds: 60, keyBy: 'user' },
  /** General API: 200/min per user. */
  general: { limit: 200, windowSeconds: 60, keyBy: 'user' },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Submission window
// ---------------------------------------------------------------------------

/**
 * Whether a student may still submit for a past date, and how far back.
 *
 * 0 means today only, which is what "answer within the day to get the attendance"
 * asks for. Raising it lets a student back-fill a missed day.
 */
export const SUBMISSION_BACKDATE_DAYS = 0;

/**
 * Whether a student may replace an already-submitted answer set for the same day.
 * Only a `declined` submission can be resubmitted, so this governs re-editing a
 * `pending` one.
 */
export const ALLOW_EDIT_WHILE_PENDING = true;

// ---------------------------------------------------------------------------
// Retakes
// ---------------------------------------------------------------------------

/**
 * How long a faculty-granted retake stays usable when no deadline is chosen.
 *
 * A grant needs an end date. Without one, a day that closed at midnight would stay
 * writable indefinitely, which removes the deadline the whole attendance rule rests
 * on. A week is long enough to cover the reason the student missed the day
 * (illness, network, travel) without turning "answer on the day" into a suggestion.
 */
export const RETAKE_DEFAULT_WINDOW_DAYS = 7;

/** Bound on the deadline a reviewer may set, counted from the day of the grant. */
export const RETAKE_MAX_WINDOW_DAYS = 30;

/**
 * The retake reason is shown to the student and is the justification on the record,
 * so it is required — the same reasoning that makes a decline note required. An
 * unexplained reopened day is an attendance change nobody can account for later.
 */
export const RETAKE_REASON_MIN_LENGTH = 5;
export const RETAKE_REASON_MAX_LENGTH = 300;
