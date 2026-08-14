/**
 * "Today" resolution.
 *
 * Attendance and work logs are keyed by calendar date, one record per student per
 * day. Deciding which day it *is* therefore has to happen in the institution's
 * timezone, not the server's.
 *
 * Getting this wrong is not subtle: the deployment target is an Indian college
 * (IST, UTC+5:30). If the server used UTC, then from 00:00 to 05:29 IST the server
 * would still consider it the previous day, and the 9 PM "missing daily submission"
 * reminder in 02_SRS §4 would evaluate against the wrong date. A student in
 * Puducherry submitting at 11 PM would have it filed under the wrong day.
 *
 * All dates are handled as `YYYY-MM-DD` strings, which sidesteps the whole class of
 * bugs where a Date is constructed in one zone and read in another.
 */

import { formatDateOnly, parseDateOnly } from '@ims/shared-validation';
import { env } from './env';

/**
 * Today's calendar date in the institution's timezone.
 *
 * Uses `Intl.DateTimeFormat` with the `en-CA` locale, which formats as
 * `YYYY-MM-DD` — the shape we want, without manual padding.
 */
export function today(timeZone: string = env.INSTITUTION_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Current wall-clock time in the institution's timezone, as `HH:MM`. */
export function currentTime(timeZone: string = env.INSTITUTION_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/**
 * Converts a `YYYY-MM-DD` string into the UTC-midnight Date that Prisma expects
 * for a `@db.Date` column.
 *
 * Prisma stores and returns DATE values at UTC midnight, so this is the inverse of
 * `toDateOnly` in the serializers and the two must always be used as a pair.
 */
export function toDateColumn(dateOnly: string): Date {
  return parseDateOnly(dateOnly);
}

/** Reads a `@db.Date` column back into `YYYY-MM-DD`. */
export function fromDateColumn(value: Date): string {
  return formatDateOnly(value);
}

/**
 * Inclusive date-range filter for a Prisma `@db.Date` column.
 *
 * Both bounds are converted to UTC midnight, and `lte` is used rather than `lt` on
 * the upper bound so the end date itself is included — which is what every
 * "from/to" query in 05_API_Spec means.
 */
export function dateRangeFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateColumn(from) } : {}),
    ...(to ? { lte: toDateColumn(to) } : {}),
  };
}
