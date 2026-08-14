/**
 * Attendance aggregation — 04_Database_Design §5, 05_API_Spec `GET /api/attendance/summary`.
 *
 * This is the single implementation of "how many days and hours has this student
 * done", and it is reused by:
 *   - `GET /api/attendance/summary`
 *   - the student dashboard
 *   - weekly report auto-aggregation (02_SRS §2.4)
 *   - final assessment auto-filled totals (01_PRD §4.5)
 *   - evidence export
 *
 * Having one implementation is the point. 09_Test_Plan §2 requires "weekly
 * aggregation → days/hours match attendance records exactly"; that guarantee is
 * only cheap if every caller computes it the same way.
 *
 * 04_Database_Design §5 is explicit that these values are "always computed ...
 * never stored as a raw number", so nothing here reads a cached total.
 */

import type { AttendanceStatus, AttendanceSummary } from '@ims/shared-types';
import {
  calculateAttendancePercentage,
  countWorkingDays,
  emptyStatusCounts,
  type AttendanceStatusCounts,
} from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { dateRangeFilter } from '@/lib/clock';
import { toNumber } from '@/lib/serialize';

export interface SummaryOptions {
  /** Restrict to a date window. Used by weekly aggregation. */
  from?: string;
  to?: string;
}

/**
 * Counts attendance rows by status and sums recorded hours for one internship.
 *
 * Uses `groupBy` so the arithmetic happens in Postgres rather than by pulling every
 * row into Node — which is what keeps the "< 100 ms with indexes" target in
 * 09_Test_Plan §7 reachable for a 90-day internship.
 */
export async function getAttendanceSummary(
  internshipId: string,
  options: SummaryOptions = {},
): Promise<AttendanceSummary> {
  const dateFilter = dateRangeFilter(options.from, options.to);

  const grouped = await prisma.attendance.groupBy({
    by: ['status'],
    where: {
      internshipId,
      ...(dateFilter ? { attendanceDate: dateFilter } : {}),
    },
    _count: { _all: true },
    _sum: { totalHours: true },
  });

  const counts: AttendanceStatusCounts = emptyStatusCounts();
  let totalHours = 0;

  for (const row of grouped) {
    counts[row.status as AttendanceStatus] = row._count._all;
    // Hours are summed across every status. A student who logged times on a day
    // later marked as leave still worked those hours, and the DB constraint keeps
    // the value non-negative.
    totalHours += toNumber(row._sum.totalHours) ?? 0;
  }

  return {
    totalWorkingDays: countWorkingDays(counts),
    daysAttended: counts.present,
    daysAbsent: counts.absent,
    daysLeave: counts.permission_leave,
    holidays: counts.holiday + counts.weekly_off,
    attendancePercentage: calculateAttendancePercentage(counts),
    // NUMERIC(6,2) in the aggregate columns, so round to two decimals to avoid
    // floating-point dust like 336.00000000000006 reaching the client.
    totalHours: Math.round(totalHours * 100) / 100,
  };
}

/**
 * Batched version for list screens.
 *
 * The faculty student list shows an attendance percentage per student
 * (12_Mobile_App_Spec §2). Calling `getAttendanceSummary` in a loop would be one
 * query per student — the N+1 that 09_Test_Plan §7 targets with "faculty dashboard
 * loads with 200 students in < 3 seconds". This does it in one query for the whole
 * page.
 */
export async function getAttendanceSummaries(
  internshipIds: readonly string[],
): Promise<Map<string, AttendanceSummary>> {
  const result = new Map<string, AttendanceSummary>();
  if (internshipIds.length === 0) return result;

  const grouped = await prisma.attendance.groupBy({
    by: ['internshipId', 'status'],
    where: { internshipId: { in: [...internshipIds] } },
    _count: { _all: true },
    _sum: { totalHours: true },
  });

  const byInternship = new Map<string, { counts: AttendanceStatusCounts; hours: number }>();

  for (const row of grouped) {
    let entry = byInternship.get(row.internshipId);
    if (!entry) {
      entry = { counts: emptyStatusCounts(), hours: 0 };
      byInternship.set(row.internshipId, entry);
    }
    entry.counts[row.status as AttendanceStatus] = row._count._all;
    entry.hours += toNumber(row._sum.totalHours) ?? 0;
  }

  // Internships with no attendance rows still need a zeroed summary, otherwise the
  // list screen shows a blank cell instead of "0%".
  for (const internshipId of internshipIds) {
    const entry = byInternship.get(internshipId) ?? { counts: emptyStatusCounts(), hours: 0 };
    result.set(internshipId, {
      totalWorkingDays: countWorkingDays(entry.counts),
      daysAttended: entry.counts.present,
      daysAbsent: entry.counts.absent,
      daysLeave: entry.counts.permission_leave,
      holidays: entry.counts.holiday + entry.counts.weekly_off,
      attendancePercentage: calculateAttendancePercentage(entry.counts),
      totalHours: Math.round(entry.hours * 100) / 100,
    });
  }

  return result;
}
