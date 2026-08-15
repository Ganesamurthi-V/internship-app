/**
 * Pure domain calculations shared by the API and the app.
 *
 * Every function here is total and side-effect free, so the same input gives the
 * same answer on the server and on the device. That is the point: an approval
 * percentage shown in the app must match the one the API computes, and the only
 * way to guarantee that is to run identical code.
 *
 * Dates are handled as `YYYY-MM-DD` strings anchored to UTC midnight rather than
 * as `Date` objects. A `Date` carries the device's timezone, which is how "today"
 * ends up being yesterday for a student submitting at 11pm.
 */

import type { AttendanceSummary, SubmissionStatus } from '@ims/shared-types';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Words separated by any run of whitespace. Empty and blank strings count as 0. */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
}

/**
 * Normalises user text before validation or storage.
 *
 * Strips C0/C1 control characters except newline and tab, collapses runs of blank
 * lines, normalises line endings, and trims. Run before length checks so a string
 * of control characters cannot satisfy a minimum and then store as empty.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\r\n?/gu, '\n')
    // eslint-disable-next-line no-control-regex -- deliberate: strip control chars
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * True for a real calendar date in `YYYY-MM-DD`.
 *
 * The round-trip comparison is what rejects `2026-02-30`: `Date` would silently
 * roll it forward to March 2nd, so the only reliable check is to format it back
 * and require the same string.
 */
export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return formatDateOnly(date) === value;
}

/** Parses `YYYY-MM-DD` as UTC midnight. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Formats a Date as `YYYY-MM-DD` using its UTC fields. */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Shifts a date string by whole days. Negative values move backwards. */
export function addDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / MS_PER_DAY);
}

/** Inclusive on both ends. */
export function isWithinRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** 0 = Sunday, matching `Date.prototype.getUTCDay`. */
export function dayOfWeek(value: string): number {
  return parseDateOnly(value).getUTCDay();
}

export function isWeekend(value: string): boolean {
  const day = dayOfWeek(value);
  return day === 0 || day === 6;
}

/** Every date from `start` to `end` inclusive. Empty when `end` precedes `start`. */
export function enumerateDates(start: string, end: string): string[] {
  if (end < start) return [];
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Submission window
// ---------------------------------------------------------------------------

/**
 * Whether a student may submit for `date` given what today is.
 *
 * `backdateDays` of 0 means today only, which is what "answer within the day to
 * get the attendance" requires. Future dates are always rejected — a student
 * cannot pre-answer tomorrow.
 */
export function isSubmissionDateAllowed(options: {
  date: string;
  today: string;
  backdateDays: number;
}): boolean {
  const { date, today, backdateDays } = options;
  if (date > today) return false;
  return daysBetween(date, today) <= Math.max(0, backdateDays);
}

/**
 * Why a submission for `date` is closed, or null when it is open.
 *
 * Returns a message rather than a boolean so the reason can be shown to the
 * student instead of a disabled button with no explanation.
 */
export function submissionLockReason(options: {
  date: string;
  today: string;
  backdateDays: number;
  existingStatus: SubmissionStatus | null;
  allowEditWhilePending: boolean;
}): string | null {
  const { date, today, backdateDays, existingStatus, allowEditWhilePending } = options;

  if (date > today) {
    return 'You cannot submit for a future date.';
  }

  if (!isSubmissionDateAllowed({ date, today, backdateDays })) {
    return backdateDays === 0
      ? 'This day has closed. Answers must be submitted on the day.'
      : `This day has closed. Answers can only be submitted within ${backdateDays} day(s).`;
  }

  if (existingStatus === 'approved') {
    return 'This submission has been approved and can no longer be changed.';
  }

  if (existingStatus === 'pending' && !allowEditWhilePending) {
    return 'Your answers are awaiting review and cannot be changed.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Attendance summary — derived from submission statuses
// ---------------------------------------------------------------------------

/** A submission reduced to what the summary needs. */
export interface SubmissionTally {
  submissionDate: string;
  status: SubmissionStatus;
}

/** Zeroed summary, used when a student has no submissions yet. */
export function emptyAttendanceSummary(): AttendanceSummary {
  return {
    daysApproved: 0,
    daysPending: 0,
    daysDeclined: 0,
    daysSubmitted: 0,
    approvalPercentage: null,
    firstSubmissionDate: null,
    lastSubmissionDate: null,
  };
}

/**
 * Rolls submissions up into the summary shown on both dashboards.
 *
 * `approvalPercentage` is approved over *submitted*, not over calendar days: a
 * student is measured on the days they answered, since a day nobody was asked
 * about is not a day they failed.
 *
 * Duplicate dates are collapsed by taking the strongest status for that date
 * (approved beats pending beats declined). The unique constraint on
 * `(student_id, submission_date)` means that should not happen, but a summary
 * that silently double-counts would be worse than one that is defensive.
 */
export function summariseSubmissions(
  submissions: readonly SubmissionTally[],
): AttendanceSummary {
  if (submissions.length === 0) return emptyAttendanceSummary();

  const rank: Record<SubmissionStatus, number> = { declined: 0, pending: 1, approved: 2 };
  const byDate = new Map<string, SubmissionStatus>();

  for (const entry of submissions) {
    const existing = byDate.get(entry.submissionDate);
    if (existing === undefined || rank[entry.status] > rank[existing]) {
      byDate.set(entry.submissionDate, entry.status);
    }
  }

  let daysApproved = 0;
  let daysPending = 0;
  let daysDeclined = 0;

  for (const status of byDate.values()) {
    if (status === 'approved') daysApproved += 1;
    else if (status === 'pending') daysPending += 1;
    else daysDeclined += 1;
  }

  const dates = [...byDate.keys()].sort();
  const daysSubmitted = byDate.size;

  return {
    daysApproved,
    daysPending,
    daysDeclined,
    daysSubmitted,
    approvalPercentage:
      daysSubmitted > 0 ? Math.round((daysApproved / daysSubmitted) * 1000) / 10 : null,
    firstSubmissionDate: dates[0] ?? null,
    lastSubmissionDate: dates[dates.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Answer completeness
// ---------------------------------------------------------------------------

/** A question reduced to what completeness checking needs. */
export interface RequiredQuestion {
  id: string;
  required: boolean;
}

/**
 * Ids of required questions with no non-blank answer.
 *
 * Returned as a list rather than a boolean so the caller can point at the
 * specific fields instead of saying "something is missing".
 */
export function findMissingRequiredAnswers(
  questions: readonly RequiredQuestion[],
  answers: readonly { questionId: string; answerText: string }[],
): string[] {
  const answered = new Set(
    answers
      .filter((answer) => sanitizeText(answer.answerText).length > 0)
      .map((answer) => answer.questionId),
  );

  return questions
    .filter((question) => question.required && !answered.has(question.id))
    .map((question) => question.id);
}

/** Ids of answers that do not correspond to any question offered. */
export function findUnknownAnswers(
  questions: readonly { id: string }[],
  answers: readonly { questionId: string }[],
): string[] {
  const known = new Set(questions.map((question) => question.id));
  return answers.map((answer) => answer.questionId).filter((id) => !known.has(id));
}
