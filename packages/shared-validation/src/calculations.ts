/**
 * Pure domain calculations.
 *
 * These live in a shared package because both sides need them but for different
 * reasons: the mobile app uses them to render live counters and pre-filled
 * read-only fields, while the backend uses them as the authority that is written
 * to the database. 04_Database_Design §5 is explicit that aggregates are
 * computed, never trusted from the client — so the mobile results are display
 * only and the server always recomputes.
 *
 * Every function here is deterministic and side-effect free, which is what makes
 * the unit tests in 09_Test_Plan §1 possible.
 */

import {
  DAYS_PER_WEEK,
  NON_WORKING_ATTENDANCE_STATUSES,
  type AttendanceStatus,
  type InternshipDuration,
} from '@ims/shared-types';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Counts words the same way the live counter does, so a student never sees
 * "198/200" and then gets a server rejection.
 *
 * Rules: split on any Unicode whitespace, discard empty fragments. A token of
 * pure punctuation still counts as a word — matching what a person sees on
 * screen rather than trying to be clever about language.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
}

/**
 * 07_Security_and_Privacy §6 — "strip control characters from free-text fields".
 * Removes C0/C1 control characters but keeps newline and tab, which are
 * legitimate in multi-line activity descriptions.
 */
export function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, '').trim();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_ONLY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;

export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = parseDateOnly(value);
  // Rejects impossible dates like 2026-02-30, which the regex alone allows.
  return formatDateOnly(parsed) === value;
}

export function isTimeOnly(value: string): boolean {
  return TIME_ONLY_PATTERN.test(value);
}

/**
 * Parses `YYYY-MM-DD` into a UTC-midnight Date.
 *
 * UTC is deliberate: attendance dates are calendar facts, not instants. Parsing
 * as local time would shift the date by one day for users east or west of UTC
 * and corrupt the unique-per-day constraint.
 */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  const millis = parseDateOnly(to).getTime() - parseDateOnly(from).getTime();
  return Math.round(millis / 86_400_000);
}

/** True when `date` falls within `[start, end]` inclusive. */
export function isWithinRange(date: string, start: string, end: string): boolean {
  return daysBetween(start, date) >= 0 && daysBetween(date, end) >= 0;
}

/** 0 = Sunday … 6 = Saturday, evaluated in UTC to match `parseDateOnly`. */
export function dayOfWeek(value: string): number {
  return parseDateOnly(value).getUTCDay();
}

export function isWeekend(value: string): boolean {
  const day = dayOfWeek(value);
  return day === 0 || day === 6;
}

/** Every date from `start` to `end` inclusive. */
export function enumerateDates(start: string, end: string): string[] {
  const total = daysBetween(start, end);
  if (total < 0) return [];
  return Array.from({ length: total + 1 }, (_, index) => addDays(start, index));
}

// ---------------------------------------------------------------------------
// Internship duration — 02_SRS §2.1
// ---------------------------------------------------------------------------

/**
 * Note the difference from the database: `internships.duration_days` is a
 * generated column equal to `end_date - start_date`, which is an *exclusive*
 * span. Users expect an inclusive count ("1 June to 1 June" is one day), so
 * `calendarDays` adds one. Both values are correct for their own purpose.
 */
export function calculateInternshipDuration(
  startDate: string,
  endDate: string,
): InternshipDuration {
  const span = daysBetween(startDate, endDate);
  if (span < 0) {
    return { calendarDays: 0, workingDays: 0, totalWeeks: 0 };
  }
  const calendarDays = span + 1;
  const workingDays = enumerateDates(startDate, endDate).filter((date) => !isWeekend(date)).length;
  return {
    calendarDays,
    workingDays,
    totalWeeks: Math.ceil(calendarDays / DAYS_PER_WEEK),
  };
}

// ---------------------------------------------------------------------------
// Attendance hours — 02_SRS §2.2
// ---------------------------------------------------------------------------

/** Minutes since midnight for an `HH:MM` value. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/**
 * Hours between reporting and leaving time, rounded to two decimals to match the
 * `NUMERIC(5,2)` column. Returns null when either time is missing, and null when
 * leaving is not strictly after reporting — the `valid_times` CHECK constraint
 * makes that combination unstorable anyway.
 */
export function calculateTotalHours(
  reportingTime: string | null | undefined,
  leavingTime: string | null | undefined,
): number | null {
  if (!reportingTime || !leavingTime) return null;
  const minutes = timeToMinutes(leavingTime) - timeToMinutes(reportingTime);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Attendance percentage — 04_Database_Design §5
// ---------------------------------------------------------------------------

export interface AttendanceStatusCounts {
  present: number;
  absent: number;
  permission_leave: number;
  holiday: number;
  weekly_off: number;
}

export function emptyStatusCounts(): AttendanceStatusCounts {
  return { present: 0, absent: 0, permission_leave: 0, holiday: 0, weekly_off: 0 };
}

export function tallyStatuses(statuses: readonly AttendanceStatus[]): AttendanceStatusCounts {
  const counts = emptyStatusCounts();
  for (const status of statuses) {
    counts[status] += 1;
  }
  return counts;
}

/**
 * Working days are the recorded days that actually required attendance, i.e.
 * everything except holidays and weekly offs (02_SRS §2.2).
 */
export function countWorkingDays(counts: AttendanceStatusCounts): number {
  return (Object.keys(counts) as AttendanceStatus[])
    .filter((status) => !NON_WORKING_ATTENDANCE_STATUSES.includes(status))
    .reduce((total, status) => total + counts[status], 0);
}

/**
 * `present / working_days`, as one decimal place.
 *
 * Returns 0 rather than NaN when no working days have been recorded yet, so a
 * brand-new internship renders "0%" instead of blank.
 */
export function calculateAttendancePercentage(counts: AttendanceStatusCounts): number {
  const workingDays = countWorkingDays(counts);
  if (workingDays === 0) return 0;
  return Math.round((counts.present / workingDays) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Week numbering — 04_Database_Design §5
// ---------------------------------------------------------------------------

/**
 * Week 1 starts on the internship start date, so weeks are internship-relative
 * rather than calendar-relative: `floor((date - start) / 7) + 1`.
 *
 * Returns null for dates before the start date. Dates after the end date still
 * return a number; range checking is the caller's job.
 */
export function calculateWeekNumber(startDate: string, date: string): number | null {
  const offset = daysBetween(startDate, date);
  if (offset < 0) return null;
  return Math.floor(offset / DAYS_PER_WEEK) + 1;
}

export interface WeekRange {
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
}

/**
 * Date range for a given internship week, clamped so the final week never
 * extends past the internship end date (02_SRS §2.4: "week dates must fall
 * within internship start/end dates").
 */
export function calculateWeekRange(
  startDate: string,
  endDate: string,
  weekNumber: number,
): WeekRange {
  const weekStartDate = addDays(startDate, (weekNumber - 1) * DAYS_PER_WEEK);
  const uncappedEnd = addDays(weekStartDate, DAYS_PER_WEEK - 1);
  const weekEndDate = daysBetween(uncappedEnd, endDate) < 0 ? endDate : uncappedEnd;
  return { weekNumber, weekStartDate, weekEndDate };
}

/** Total number of internship-relative weeks, at least 1. */
export function countInternshipWeeks(startDate: string, endDate: string): number {
  const span = daysBetween(startDate, endDate);
  if (span < 0) return 0;
  return Math.floor(span / DAYS_PER_WEEK) + 1;
}

// ---------------------------------------------------------------------------
// Final assessment unlock — 02_SRS §2.5
// ---------------------------------------------------------------------------

/**
 * Unlocked once the end date is reached, or when faculty granted early access.
 * `today` is injected rather than read from the clock so this stays testable.
 */
export function isFinalAssessmentUnlocked(options: {
  endDate: string;
  today: string;
  facultyUnlocked: boolean;
}): boolean {
  if (options.facultyUnlocked) return true;
  return daysBetween(options.endDate, options.today) >= 0;
}

/** Days until the internship ends; negative once it has passed. */
export function daysUntilEnd(endDate: string, today: string): number {
  return daysBetween(today, endDate);
}
