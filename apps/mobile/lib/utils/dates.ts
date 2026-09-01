/**
 * Date display helpers.
 *
 * Every date the API returns for a calendar day is a `YYYY-MM-DD` string, never a
 * timestamp. Formatting it means parsing it back, and the one mistake that matters is
 * doing that in local time: `new Date('2026-08-17')` is UTC midnight, which a device
 * behind UTC renders as the 16th. So each helper appends `T00:00:00Z` and formats with
 * `timeZone: 'UTC'`, which keeps the day the API named the day the student sees.
 */

/** `2026-08-17` → `17 Aug`. For dense lists. */
export function formatShortDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** `2026-08-17` → `Mon, 17 Aug 2026`. For anywhere the exact day carries weight. */
export function formatLongDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Whole days from `dateOnly` until `today`, as a plain phrase.
 *
 * Used for retake deadlines, where "2 days left" is the number the student acts on
 * and a formatted date is not.
 */
export function daysUntil(dateOnly: string, today: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const from = new Date(`${today}T00:00:00Z`).getTime();
  const to = new Date(`${dateOnly}T00:00:00Z`).getTime();
  return Math.round((to - from) / MS_PER_DAY);
}

/** `0` → `today`, `1` → `tomorrow`, otherwise `in N days` / `N days ago`. */
export function describeDaysUntil(dateOnly: string, today: string): string {
  const days = daysUntil(dateOnly, today);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
