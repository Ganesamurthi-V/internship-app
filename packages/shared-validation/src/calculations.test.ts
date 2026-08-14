/**
 * Unit tests for the business-logic calculations listed in 09_Test_Plan §1.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  calculateAttendancePercentage,
  calculateInternshipDuration,
  calculateTotalHours,
  calculateWeekNumber,
  calculateWeekRange,
  countInternshipWeeks,
  countWords,
  countWorkingDays,
  dayOfWeek,
  daysBetween,
  enumerateDates,
  formatDateOnly,
  isDateOnly,
  isFinalAssessmentUnlocked,
  isTimeOnly,
  isWithinRange,
  sanitizeText,
  tallyStatuses,
  timeToMinutes,
} from './calculations';

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('treats runs of whitespace and newlines as one separator', () => {
    expect(countWords('one   two\n\nthree\tfour')).toBe(4);
  });

  it('returns 0 for empty, blank, null and undefined', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('    \n ')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });

  it('ignores leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });

  it('counts a 200-word string as exactly 200', () => {
    const text = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    expect(countWords(text)).toBe(200);
  });
});

describe('sanitizeText', () => {
  it('strips control characters but keeps newlines and tabs', () => {
    expect(sanitizeText('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeText('line1\nline2\tend')).toBe('line1\nline2\tend');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeText('  padded  ')).toBe('padded');
  });
});

describe('date primitives', () => {
  it('accepts valid ISO dates and rejects impossible ones', () => {
    expect(isDateOnly('2026-08-14')).toBe(true);
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
    expect(isDateOnly('14-08-2026')).toBe(false);
    expect(isDateOnly('2026-8-4')).toBe(false);
  });

  it('accepts leap days in leap years only', () => {
    expect(isDateOnly('2024-02-29')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
  });

  it('validates HH:MM times', () => {
    expect(isTimeOnly('09:00')).toBe(true);
    expect(isTimeOnly('23:59')).toBe(true);
    expect(isTimeOnly('24:00')).toBe(false);
    expect(isTimeOnly('9:00')).toBe(false);
    expect(isTimeOnly('09:60')).toBe(false);
  });

  it('round-trips through parse and format', () => {
    expect(formatDateOnly(new Date(Date.UTC(2026, 7, 14)))).toBe('2026-08-14');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-08-14', 1)).toBe('2026-08-15');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('measures days between dates, signed', () => {
    expect(daysBetween('2026-08-14', '2026-08-14')).toBe(0);
    expect(daysBetween('2026-06-01', '2026-07-31')).toBe(60);
    expect(daysBetween('2026-07-31', '2026-06-01')).toBe(-60);
  });

  it('is immune to DST shifts by working in UTC', () => {
    // Spans the European DST change; a local-time implementation would return 30.
    expect(daysBetween('2026-03-15', '2026-04-15')).toBe(31);
  });

  it('checks inclusive range membership', () => {
    expect(isWithinRange('2026-06-01', '2026-06-01', '2026-07-31')).toBe(true);
    expect(isWithinRange('2026-07-31', '2026-06-01', '2026-07-31')).toBe(true);
    expect(isWithinRange('2026-05-31', '2026-06-01', '2026-07-31')).toBe(false);
    expect(isWithinRange('2026-08-01', '2026-06-01', '2026-07-31')).toBe(false);
  });

  it('reports day of week with Sunday as 0', () => {
    expect(dayOfWeek('2026-08-16')).toBe(0); // Sunday
    expect(dayOfWeek('2026-08-14')).toBe(5); // Friday
  });

  it('enumerates an inclusive date range', () => {
    expect(enumerateDates('2026-08-14', '2026-08-16')).toEqual([
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ]);
    expect(enumerateDates('2026-08-14', '2026-08-14')).toEqual(['2026-08-14']);
    expect(enumerateDates('2026-08-16', '2026-08-14')).toEqual([]);
  });
});

describe('calculateInternshipDuration', () => {
  it('counts calendar days inclusively', () => {
    // 1 June to 31 July 2026 = 61 calendar days.
    const duration = calculateInternshipDuration('2026-06-01', '2026-07-31');
    expect(duration.calendarDays).toBe(61);
  });

  it('excludes weekends from working days', () => {
    // Mon 2026-08-10 to Sun 2026-08-16: 7 calendar days, 5 working days.
    const duration = calculateInternshipDuration('2026-08-10', '2026-08-16');
    expect(duration.calendarDays).toBe(7);
    expect(duration.workingDays).toBe(5);
    expect(duration.totalWeeks).toBe(1);
  });

  it('treats a single day as one calendar day', () => {
    const duration = calculateInternshipDuration('2026-08-14', '2026-08-14');
    expect(duration.calendarDays).toBe(1);
    expect(duration.workingDays).toBe(1);
  });

  it('returns zeros when the end precedes the start', () => {
    expect(calculateInternshipDuration('2026-08-14', '2026-08-01')).toEqual({
      calendarDays: 0,
      workingDays: 0,
      totalWeeks: 0,
    });
  });
});

describe('calculateTotalHours', () => {
  it('computes fractional hours from HH:MM times', () => {
    expect(calculateTotalHours('09:00', '17:30')).toBe(8.5);
    expect(calculateTotalHours('09:00', '17:00')).toBe(8);
  });

  it('rounds to two decimals to match NUMERIC(5,2)', () => {
    expect(calculateTotalHours('09:00', '09:20')).toBe(0.33);
    expect(calculateTotalHours('09:00', '09:10')).toBe(0.17);
  });

  it('returns null when either time is missing', () => {
    expect(calculateTotalHours(null, '17:30')).toBeNull();
    expect(calculateTotalHours('09:00', null)).toBeNull();
    expect(calculateTotalHours(undefined, undefined)).toBeNull();
  });

  it('returns null when leaving is not after reporting', () => {
    expect(calculateTotalHours('17:30', '09:00')).toBeNull();
    expect(calculateTotalHours('09:00', '09:00')).toBeNull();
  });

  it('converts times to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('attendance percentage', () => {
  it('excludes holidays and weekly offs from the denominator', () => {
    const counts = tallyStatuses([
      'present',
      'present',
      'present',
      'absent',
      'holiday',
      'weekly_off',
    ]);
    // Working days = 3 present + 1 absent = 4. 3/4 = 75%.
    expect(countWorkingDays(counts)).toBe(4);
    expect(calculateAttendancePercentage(counts)).toBe(75);
  });

  it('counts permission leave as a working day that was not attended', () => {
    const counts = tallyStatuses(['present', 'permission_leave']);
    expect(countWorkingDays(counts)).toBe(2);
    expect(calculateAttendancePercentage(counts)).toBe(50);
  });

  it('matches the worked example in the API spec', () => {
    // 05_API_Spec: 42 attended of 45 working days => 93.3%.
    const counts = tallyStatuses([
      ...Array<'present'>(42).fill('present'),
      ...Array<'absent'>(1).fill('absent'),
      ...Array<'permission_leave'>(2).fill('permission_leave'),
      'holiday',
    ]);
    expect(countWorkingDays(counts)).toBe(45);
    expect(calculateAttendancePercentage(counts)).toBe(93.3);
  });

  it('returns 0 rather than NaN when nothing is recorded', () => {
    expect(calculateAttendancePercentage(tallyStatuses([]))).toBe(0);
  });

  it('returns 0 when only non-working days are recorded', () => {
    expect(calculateAttendancePercentage(tallyStatuses(['holiday', 'weekly_off']))).toBe(0);
  });

  it('returns 100 for a perfect record', () => {
    expect(calculateAttendancePercentage(tallyStatuses(['present', 'present']))).toBe(100);
  });
});

describe('week numbering', () => {
  const start = '2026-06-01';

  it('starts week 1 on the internship start date', () => {
    expect(calculateWeekNumber(start, '2026-06-01')).toBe(1);
    expect(calculateWeekNumber(start, '2026-06-07')).toBe(1);
  });

  it('rolls to week 2 on the eighth day', () => {
    expect(calculateWeekNumber(start, '2026-06-08')).toBe(2);
    expect(calculateWeekNumber(start, '2026-06-14')).toBe(2);
  });

  it('returns null before the internship starts', () => {
    expect(calculateWeekNumber(start, '2026-05-31')).toBeNull();
  });

  it('derives the date range for a week', () => {
    expect(calculateWeekRange(start, '2026-07-31', 1)).toEqual({
      weekNumber: 1,
      weekStartDate: '2026-06-01',
      weekEndDate: '2026-06-07',
    });
    expect(calculateWeekRange(start, '2026-07-31', 5)).toEqual({
      weekNumber: 5,
      weekStartDate: '2026-06-29',
      weekEndDate: '2026-07-05',
    });
  });

  it('clamps the final week to the internship end date', () => {
    // Week 9 would run 2026-07-27..2026-08-02 but the internship ends 07-31.
    expect(calculateWeekRange(start, '2026-07-31', 9)).toEqual({
      weekNumber: 9,
      weekStartDate: '2026-07-27',
      weekEndDate: '2026-07-31',
    });
  });

  it('counts total internship weeks', () => {
    expect(countInternshipWeeks('2026-06-01', '2026-06-07')).toBe(1);
    expect(countInternshipWeeks('2026-06-01', '2026-06-08')).toBe(2);
    expect(countInternshipWeeks('2026-06-01', '2026-07-31')).toBe(9);
    expect(countInternshipWeeks('2026-06-01', '2026-06-01')).toBe(1);
  });

  it('keeps week range and week number mutually consistent', () => {
    const end = '2026-07-31';
    for (let week = 1; week <= countInternshipWeeks(start, end); week += 1) {
      const range = calculateWeekRange(start, end, week);
      expect(calculateWeekNumber(start, range.weekStartDate)).toBe(week);
      expect(calculateWeekNumber(start, range.weekEndDate)).toBe(week);
    }
  });
});

describe('isFinalAssessmentUnlocked', () => {
  it('stays locked before the end date', () => {
    expect(
      isFinalAssessmentUnlocked({
        endDate: '2026-07-31',
        today: '2026-07-30',
        facultyUnlocked: false,
      }),
    ).toBe(false);
  });

  it('unlocks on the end date itself', () => {
    expect(
      isFinalAssessmentUnlocked({
        endDate: '2026-07-31',
        today: '2026-07-31',
        facultyUnlocked: false,
      }),
    ).toBe(true);
  });

  it('unlocks early when faculty grants access', () => {
    expect(
      isFinalAssessmentUnlocked({
        endDate: '2026-07-31',
        today: '2026-06-15',
        facultyUnlocked: true,
      }),
    ).toBe(true);
  });
});
