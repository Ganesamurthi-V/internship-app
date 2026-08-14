/**
 * Security, rate-limit and policy constants taken verbatim from
 * docs/07_Security_and_Privacy.md. Centralised here so the backend limiter and
 * the mobile client's optimistic checks can never drift apart.
 */

// ---------------------------------------------------------------------------
// Passwords — 07_Security_and_Privacy §5
// ---------------------------------------------------------------------------

/** Minimum 8 characters, at least 1 uppercase, 1 number. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_POLICY_DESCRIPTION =
  'At least 8 characters, including one uppercase letter and one number.';

/** bcrypt cost factor must be >= 12. */
export const BCRYPT_COST_FACTOR = 12;

/** Login rate limit: 10 attempts per 15 minutes, per IP *and* per email. */
export const MAX_LOGIN_ATTEMPTS = 10;
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;

/** Password reset token is valid for 1 hour. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Tokens — 03_TechSpec §3.5
// ---------------------------------------------------------------------------

/** Access token 15-minute TTL. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token 30-day TTL, rotated on every use. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Presigned URL TTLs — 03_TechSpec §6 / 07_Security_and_Privacy §4
// ---------------------------------------------------------------------------

export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// API rate limits — 07_Security_and_Privacy §6
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
  /** Report export: 5/min per user. */
  reportExport: { limit: 5, windowSeconds: 60, keyBy: 'user' },
  /** General API: 200/min per user. */
  general: { limit: 200, windowSeconds: 60, keyBy: 'user' },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

// ---------------------------------------------------------------------------
// Pagination — 05_API_Spec standard list shape
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Notification schedule defaults — 02_SRS §4 (admin-configurable)
// ---------------------------------------------------------------------------

export const NOTIFICATION_DEFAULTS = {
  /** Missing daily submission reminder, local time HH:MM. */
  missingDailySubmissionAt: '21:00',
  /** Weekly report reminder: Sunday 18:00. 0 = Sunday, per JS getDay(). */
  weeklyReportReminderDay: 0,
  weeklyReportReminderAt: '18:00',
  /** Final assessment reminder fires this many days before internship end. */
  finalAssessmentLeadDays: 3,
} as const;

// ---------------------------------------------------------------------------
// Week handling — 02_SRS §2.4, 04_Database_Design §5
// ---------------------------------------------------------------------------

/**
 * Internship weeks are derived as `floor((date - startDate) / 7) + 1`, so week 1
 * begins on the internship start date rather than on a calendar Monday. The
 * server is the only authority for this value (04_Database_Design §5).
 */
export const DAYS_PER_WEEK = 7;

// ---------------------------------------------------------------------------
// Offline sync — 03_TechSpec §5
// ---------------------------------------------------------------------------

/** Maximum records accepted in a single POST /api/sync batch. */
export const MAX_SYNC_BATCH_SIZE = 200;
