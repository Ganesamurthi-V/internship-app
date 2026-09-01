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
import { DEFAULT_WORKING_DAYS } from '@ims/shared-types';

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
  /**
   * A faculty-granted retake for this exact date, still within its deadline.
   *
   * This is the *only* thing that reopens a closed day, and it relaxes nothing
   * else: a future date is still refused, and an approved day is still final.
   * Reopening a day nobody authorised, or one already approved, would make the
   * attendance record editable after the fact.
   */
  retakeOpen?: boolean;
}): string | null {
  const { date, today, backdateDays, existingStatus, allowEditWhilePending } = options;
  const retakeOpen = options.retakeOpen ?? false;

  if (date > today) {
    return 'You cannot submit for a future date.';
  }

  if (!retakeOpen && !isSubmissionDateAllowed({ date, today, backdateDays })) {
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

/** Zeroed summary, used when a student has no submissions and no internship window. */
export function emptyAttendanceSummary(
  workingDays: readonly number[] = DEFAULT_WORKING_DAYS,
): AttendanceSummary {
  return {
    internshipDays: 0,
    elapsedDays: 0,
    daysApproved: 0,
    daysPending: 0,
    daysDeclined: 0,
    daysNotAnswered: 0,
    daysAbsent: 0,
    daysRecoverable: 0,
    daysSubmitted: 0,
    attendancePercentage: null,
    workingDays: [...workingDays],
    firstSubmissionDate: null,
    lastSubmissionDate: null,
  };
}

// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

/**
 * Whether `date` is one of the student's working days.
 *
 * Compares against `getUTCDay` numbering directly, which is why `WORKING_DAYS` uses
 * that numbering rather than a Monday-first scheme.
 */
export function isWorkingDay(date: string, workingDays: readonly number[]): boolean {
  return workingDays.includes(dayOfWeek(date));
}

/**
 * Working days from `start` to `end`, inclusive.
 *
 * Walks the range a day at a time rather than doing week arithmetic. An internship is
 * measured in weeks or months, so the cost is irrelevant, and the closed-form version
 * of this (whole weeks times set size, plus a partial-week remainder that wraps) is
 * exactly the kind of code that is wrong by one for six months without anyone noticing.
 */
export function countWorkingDays(
  start: string,
  end: string,
  workingDays: readonly number[],
): number {
  if (end < start || workingDays.length === 0) return 0;

  let count = 0;
  let cursor = start;
  while (cursor <= end) {
    if (isWorkingDay(cursor, workingDays)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Every working day from `start` to `end`, inclusive. */
export function enumerateWorkingDays(
  start: string,
  end: string,
  workingDays: readonly number[],
): string[] {
  if (end < start || workingDays.length === 0) return [];

  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (isWorkingDay(cursor, workingDays)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * The internship period a student is measured against.
 *
 * `startDate` and `endDate` come straight off the student record and are both
 * nullable there, so both are optional here.
 */
export interface AttendanceWindow {
  startDate: string | null;
  endDate: string | null;
  /** Today in the institution's timezone. Always server-supplied, never the device clock. */
  today: string;
  /**
   * Weekdays the student is expected to answer on, 0 = Sunday.
   *
   * Required rather than defaulted, because a silent fallback here would mark students
   * absent for days their institution never expected them to work, and the number
   * would look entirely plausible.
   */
  workingDays: readonly number[];
  /**
   * Dates with a faculty retake currently open, used only to report how many absent
   * days are still recoverable. Does not change the percentage: a reopened day counts
   * present once it is approved, not when it is granted.
   */
  retakeOpenDates?: readonly string[];
}

/** The two ends of an internship, resolved against today. */
interface ResolvedWindow {
  start: string;
  /** Last day of the internship, for the denominator. */
  internshipEnd: string;
  /** Last day that has closed, for counting absences. Today is still answerable. */
  closedEnd: string;
}

/**
 * Resolves the internship into the two ranges attendance needs, or null when there is
 * nothing measurable.
 *
 * The denominator runs to `endDate` so the whole internship is the basis from day one:
 * that is what makes a student open at 100% and lose a slice per missed day, instead of
 * opening at 0% and climbing. With no end date recorded the length is unknowable, so it
 * falls back to today — still 100% on day one, but a single miss weighs far more early
 * on. That is a reason to record end dates, not a reason to invent one.
 *
 * Absences are counted only to *yesterday*. Today has not closed, so a student who has
 * not answered yet this morning is not absent — they are simply not done.
 */
function resolveWindow(
  window: AttendanceWindow,
  firstSubmissionDate: string | null,
): ResolvedWindow | null {
  const start = window.startDate ?? firstSubmissionDate;
  if (!start) return null;

  const yesterday = addDays(window.today, -1);

  const internshipEnd = window.endDate ?? window.today;
  const closedEnd =
    window.endDate !== null && window.endDate < yesterday ? window.endDate : yesterday;

  if (internshipEnd < start) return null;

  return { start, internshipEnd, closedEnd };
}

/**
 * Working days in the internship — the attendance denominator.
 *
 * When `startDate` is missing the first submission stands in for it, which is the only
 * honest floor available: there is no way to know a student was expected on a day
 * before any record of them exists. With neither a start date nor a submission the
 * answer is 0, and the caller reports "no data" rather than a percentage.
 */
export function countInternshipDays(
  window: AttendanceWindow,
  firstSubmissionDate: string | null,
): number {
  const resolved = resolveWindow(window, firstSubmissionDate);
  if (!resolved) return 0;
  return countWorkingDays(resolved.start, resolved.internshipEnd, window.workingDays);
}

/**
 * Rolls submissions up into the summary shown on every dashboard.
 *
 * THE RULE
 *
 * A student starts at 100% and loses `1 / internshipDays` for each working day that
 * closed without an approved answer. Two things follow, both deliberate:
 *
 *   - **A pending day costs nothing.** The student answered inside the window. Whether
 *     a reviewer has reached it yet is not the student's conduct, and charging them for
 *     the queue would make every percentage sag each evening and recover on approval.
 *   - **A retake gives the day back.** Nothing special happens here — an approved
 *     retake is simply an approved day, so it stops being absent by the same rule that
 *     made it absent.
 *
 * Days outside `workingDays` are ignored entirely: not present, not absent, not in the
 * denominator. A submission on a non-working day is still visible in the history, but
 * it cannot earn credit for a day nobody was expected to work, because that would let
 * a student exceed 100%.
 *
 * `window` is optional so a caller with no internship dates to hand still gets the
 * status counts. Without one, never-answered days are undetectable — there is no
 * calendar to compare against — so absence covers only declined days and the
 * denominator falls back to the days actually submitted.
 *
 * Duplicate dates are collapsed by taking the strongest status for that date (approved
 * beats pending beats declined). The unique constraint on
 * `(student_id, submission_date)` means that should not happen, but a summary that
 * silently double-counts would be worse than one that is defensive.
 */
export function summariseSubmissions(
  submissions: readonly SubmissionTally[],
  window?: AttendanceWindow,
): AttendanceSummary {
  const rank: Record<SubmissionStatus, number> = { declined: 0, pending: 1, approved: 2 };
  const byDate = new Map<string, SubmissionStatus>();

  for (const entry of submissions) {
    const existing = byDate.get(entry.submissionDate);
    if (existing === undefined || rank[entry.status] > rank[existing]) {
      byDate.set(entry.submissionDate, entry.status);
    }
  }

  const dates = [...byDate.keys()].sort();
  const firstSubmissionDate = dates[0] ?? null;
  const lastSubmissionDate = dates[dates.length - 1] ?? null;

  const workingDays = window ? [...window.workingDays] : [...DEFAULT_WORKING_DAYS];
  const resolved = window ? resolveWindow(window, firstSubmissionDate) : null;

  // ---- No internship window: report what the submissions alone can support ----
  if (!resolved || !window) {
    let approved = 0;
    let pending = 0;
    let declined = 0;
    for (const status of byDate.values()) {
      if (status === 'approved') approved += 1;
      else if (status === 'pending') pending += 1;
      else declined += 1;
    }

    const submitted = byDate.size;
    return {
      internshipDays: submitted,
      elapsedDays: submitted,
      daysApproved: approved,
      daysPending: pending,
      daysDeclined: declined,
      // Undetectable without a calendar to compare against.
      daysNotAnswered: 0,
      daysAbsent: declined,
      daysRecoverable: 0,
      daysSubmitted: submitted,
      attendancePercentage:
        submitted > 0 ? roundToTenth(100 - (declined / submitted) * 100) : null,
      workingDays,
      firstSubmissionDate,
      lastSubmissionDate,
    };
  }

  const { start, internshipEnd, closedEnd } = resolved;

  const internshipDays = countWorkingDays(start, internshipEnd, workingDays);
  const elapsedDays = countWorkingDays(start, closedEnd, workingDays);

  // ---- Display counts: every working day inside the internship, today included ----
  // Today is included here but excluded from the absence pass below, so a student who
  // answers this morning sees "1 awaiting review" without today being judged yet.
  let daysApproved = 0;
  let daysPending = 0;
  let daysDeclined = 0;
  let daysSubmitted = 0;

  for (const [date, status] of byDate) {
    if (date < start || date > internshipEnd) continue;
    if (!isWorkingDay(date, workingDays)) continue;

    daysSubmitted += 1;
    if (status === 'approved') daysApproved += 1;
    else if (status === 'pending') daysPending += 1;
    else daysDeclined += 1;
  }

  // ---- Absence: closed working days without an approved or pending answer ----
  const retakeOpen = new Set(window.retakeOpenDates ?? []);
  let daysNotAnswered = 0;
  let daysAbsent = 0;
  let daysRecoverable = 0;

  for (const date of enumerateWorkingDays(start, closedEnd, workingDays)) {
    const status = byDate.get(date);

    if (status === 'approved' || status === 'pending') continue;

    if (status === undefined) daysNotAnswered += 1;
    daysAbsent += 1;
    if (retakeOpen.has(date)) daysRecoverable += 1;
  }

  return {
    internshipDays,
    elapsedDays,
    daysApproved,
    daysPending,
    daysDeclined,
    daysNotAnswered,
    daysAbsent,
    daysRecoverable,
    daysSubmitted,
    // Clamped at 0: with no end date recorded the denominator is only the elapsed
    // days, so a student who missed everything lands exactly on 0 rather than below it.
    attendancePercentage:
      internshipDays > 0
        ? Math.max(0, roundToTenth(100 - (daysAbsent / internshipDays) * 100))
        : null,
    workingDays,
    firstSubmissionDate,
    lastSubmissionDate,
  };
}

/** One decimal place, so 96.66666 reads as 96.7. */
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
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
