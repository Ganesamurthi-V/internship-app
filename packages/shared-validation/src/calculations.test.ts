/**
 * Tests for the shared pure functions and the answer validator.
 *
 * These exist because the same code runs on the device and on the server: if
 * `summariseSubmissions` disagreed between the two, a student would see a
 * different approval percentage than the faculty reviewing them.
 *
 * The cases are chosen around boundaries and the things that actually go wrong
 * (timezone rollover, invalid calendar dates, duplicate rows) rather than
 * restating the happy path in five ways.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  countInternshipDays,
  countWorkingDays,
  countWords,
  dayOfWeek,
  daysBetween,
  enumerateDates,
  enumerateWorkingDays,
  findMissingRequiredAnswers,
  findUnknownAnswers,
  formatDateOnly,
  isDateOnly,
  isSubmissionDateAllowed,
  isWeekend,
  isWithinRange,
  isWorkingDay,
  parseDateOnly,
  sanitizeText,
  submissionLockReason,
  summariseSubmissions,
  emptyAttendanceSummary,
} from './calculations';
import {
  ANSWER_HARD_MAX_LENGTH,
  LONG_ANSWER_MAX_WORDS,
  LONG_ANSWER_MIN_WORDS,
  SHORT_ANSWER_MAX_WORDS,
  SHORT_ANSWER_MIN_WORDS,
  describeWorkingDays,
} from '@ims/shared-types';
import { answerValidatorFor } from './question';
import { validateAnswersAgainstQuestions, type QuestionRule } from './submission';
import { reviewSubmissionSchema } from './submission';
import { submitAnswersSchema } from './submission';
import { createQuestionSchema } from './question';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

describe('countWords', () => {
  it('counts words separated by any whitespace run', () => {
    expect(countWords('one two   three\nfour\tfive')).toBe(5);
  });

  it('treats null, undefined and blank as zero', () => {
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });
});

describe('sanitizeText', () => {
  it('strips control characters that would otherwise pass a length check', () => {
    // A string of control chars has length > 0 but no content. If sanitising ran
    // after validation, this would satisfy min(1) and store as empty.
    expect(sanitizeText('\u0000\u0001\u0002')).toBe('');
  });

  it('keeps newlines and tabs but collapses excessive blank lines', () => {
    expect(sanitizeText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('normalises CRLF to LF', () => {
    expect(sanitizeText('a\r\nb')).toBe('a\nb');
  });

  it('collapses runs of spaces and trims the ends', () => {
    expect(sanitizeText('  a    b  ')).toBe('a b');
  });
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

describe('isDateOnly', () => {
  it('accepts a real date', () => {
    expect(isDateOnly('2026-08-17')).toBe(true);
  });

  it('rejects a date that Date would silently roll forward', () => {
    // new Date('2026-02-30') becomes March 2nd. Only the round-trip check catches it.
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(isDateOnly('2024-02-29')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
  });

  it('rejects wrong formats', () => {
    expect(isDateOnly('17-08-2026')).toBe(false);
    expect(isDateOnly('2026-8-1')).toBe(false);
    expect(isDateOnly('')).toBe(false);
  });
});

describe('date arithmetic', () => {
  it('parses and formats as UTC so the device timezone cannot shift the day', () => {
    expect(formatDateOnly(parseDateOnly('2026-08-17'))).toBe('2026-08-17');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('measures signed day distance', () => {
    expect(daysBetween('2026-08-17', '2026-08-20')).toBe(3);
    expect(daysBetween('2026-08-20', '2026-08-17')).toBe(-3);
    expect(daysBetween('2026-08-17', '2026-08-17')).toBe(0);
  });

  it('is inclusive at both ends of a range', () => {
    expect(isWithinRange('2026-08-17', '2026-08-17', '2026-08-20')).toBe(true);
    expect(isWithinRange('2026-08-20', '2026-08-17', '2026-08-20')).toBe(true);
    expect(isWithinRange('2026-08-21', '2026-08-17', '2026-08-20')).toBe(false);
  });

  it('reports the weekday with Sunday as zero', () => {
    // 2026-08-16 is a Sunday.
    expect(dayOfWeek('2026-08-16')).toBe(0);
    expect(isWeekend('2026-08-16')).toBe(true);
    expect(isWeekend('2026-08-15')).toBe(true); // Saturday
    expect(isWeekend('2026-08-17')).toBe(false); // Monday
  });

  it('enumerates inclusive ranges and returns empty when reversed', () => {
    expect(enumerateDates('2026-08-17', '2026-08-19')).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    ]);
    expect(enumerateDates('2026-08-17', '2026-08-17')).toEqual(['2026-08-17']);
    expect(enumerateDates('2026-08-19', '2026-08-17')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Submission window
// ---------------------------------------------------------------------------

describe('isSubmissionDateAllowed', () => {
  it('allows today when backdating is off', () => {
    expect(
      isSubmissionDateAllowed({ date: '2026-08-17', today: '2026-08-17', backdateDays: 0 }),
    ).toBe(true);
  });

  it('rejects yesterday when backdating is off', () => {
    expect(
      isSubmissionDateAllowed({ date: '2026-08-16', today: '2026-08-17', backdateDays: 0 }),
    ).toBe(false);
  });

  it('allows within the backdate window and rejects beyond it', () => {
    expect(
      isSubmissionDateAllowed({ date: '2026-08-15', today: '2026-08-17', backdateDays: 2 }),
    ).toBe(true);
    expect(
      isSubmissionDateAllowed({ date: '2026-08-14', today: '2026-08-17', backdateDays: 2 }),
    ).toBe(false);
  });

  it('always rejects the future, regardless of the window', () => {
    expect(
      isSubmissionDateAllowed({ date: '2026-08-18', today: '2026-08-17', backdateDays: 30 }),
    ).toBe(false);
  });
});

describe('submissionLockReason', () => {
  const base = { today: '2026-08-17', backdateDays: 0, allowEditWhilePending: true };

  it('returns null when the day is open and nothing is submitted', () => {
    expect(
      submissionLockReason({ ...base, date: '2026-08-17', existingStatus: null }),
    ).toBeNull();
  });

  it('locks a future date', () => {
    expect(
      submissionLockReason({ ...base, date: '2026-08-18', existingStatus: null }),
    ).toMatch(/future/iu);
  });

  it('locks a closed past day', () => {
    expect(
      submissionLockReason({ ...base, date: '2026-08-16', existingStatus: null }),
    ).toMatch(/closed/iu);
  });

  it('locks an approved submission so an approval cannot be edited away', () => {
    expect(
      submissionLockReason({ ...base, date: '2026-08-17', existingStatus: 'approved' }),
    ).toMatch(/approved/iu);
  });

  it('leaves a declined submission open so the student can fix and resubmit', () => {
    expect(
      submissionLockReason({ ...base, date: '2026-08-17', existingStatus: 'declined' }),
    ).toBeNull();
  });

  it('honours the pending-edit setting', () => {
    expect(
      submissionLockReason({ ...base, date: '2026-08-17', existingStatus: 'pending' }),
    ).toBeNull();

    expect(
      submissionLockReason({
        ...base,
        date: '2026-08-17',
        existingStatus: 'pending',
        allowEditWhilePending: false,
      }),
    ).toMatch(/awaiting review/iu);
  });

  // A retake is the one thing that reopens a closed day. These cases pin down that
  // it reopens *only* that — a grant must not become a general-purpose override.
  describe('with a granted retake', () => {
    it('reopens a closed past day', () => {
      expect(
        submissionLockReason({
          ...base,
          date: '2026-08-10',
          existingStatus: null,
          retakeOpen: true,
        }),
      ).toBeNull();
    });

    it('reopens a closed day that was declined, so it can be fixed', () => {
      expect(
        submissionLockReason({
          ...base,
          date: '2026-08-10',
          existingStatus: 'declined',
          retakeOpen: true,
        }),
      ).toBeNull();
    });

    it('still refuses a future date', () => {
      expect(
        submissionLockReason({
          ...base,
          date: '2026-08-18',
          existingStatus: null,
          retakeOpen: true,
        }),
      ).toMatch(/future/iu);
    });

    it('still refuses an approved day, so an approval cannot be edited away', () => {
      expect(
        submissionLockReason({
          ...base,
          date: '2026-08-10',
          existingStatus: 'approved',
          retakeOpen: true,
        }),
      ).toMatch(/approved/iu);
    });

    it('still honours the pending-edit setting', () => {
      expect(
        submissionLockReason({
          ...base,
          date: '2026-08-10',
          existingStatus: 'pending',
          allowEditWhilePending: false,
          retakeOpen: true,
        }),
      ).toMatch(/awaiting review/iu);
    });

    it('changes nothing when absent, so the default stays closed', () => {
      expect(
        submissionLockReason({ ...base, date: '2026-08-10', existingStatus: null }),
      ).toMatch(/closed/iu);

      expect(
        submissionLockReason({
          ...base,
          date: '2026-08-10',
          existingStatus: null,
          retakeOpen: false,
        }),
      ).toMatch(/closed/iu);
    });
  });
});

// ---------------------------------------------------------------------------
// Attendance summary
// ---------------------------------------------------------------------------

/**
 * Calendar anchors for the cases below. August 2026 starts on a Saturday, so:
 *   Mon 3rd, Tue 4th, Wed 5th, Thu 6th, Fri 7th, Sat 8th, Sun 9th, Mon 10th ...
 * A four-week internship from Mon 3rd to Fri 28th is 20 Mon-Fri working days.
 */
const MON_TO_FRI = [1, 2, 3, 4, 5];
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

/** A four-week Mon-Fri internship. 20 working days. */
const fourWeeks = (today: string, workingDays: number[] = MON_TO_FRI) => ({
  startDate: '2026-08-03',
  endDate: '2026-08-28',
  today,
  workingDays,
});

describe('describeWorkingDays', () => {
  it('collapses a consecutive run into a range', () => {
    expect(describeWorkingDays([1, 2, 3, 4, 5])).toBe('Mon\u2013Fri');
    expect(describeWorkingDays([1, 2, 3, 4, 5, 6])).toBe('Mon\u2013Sat');
    expect(describeWorkingDays([2, 3, 4])).toBe('Tue\u2013Thu');
  });

  it('lists non-consecutive days separately', () => {
    expect(describeWorkingDays([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(describeWorkingDays([1, 2, 3, 6])).toBe('Mon\u2013Wed, Sat');
  });

  it('lists a two day run rather than hyphenating it', () => {
    expect(describeWorkingDays([1, 2])).toBe('Mon, Tue');
  });

  it('orders Monday first, so a weekday week is one run and not split by Sunday', () => {
    // Sunday is day 0, so a naive ascending sort would render this as "Sun, Mon-Fri".
    expect(describeWorkingDays([0, 1, 2, 3, 4, 5])).toBe('Mon\u2013Fri, Sun');
  });

  it('does not merge Saturday into Sunday', () => {
    // Adjacent by day number (6 then 0) but not adjacent in the week as displayed.
    expect(describeWorkingDays([6, 0])).toBe('Sat, Sun');
  });

  it('handles the whole week and the empty week', () => {
    expect(describeWorkingDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(describeWorkingDays([])).toBe('No working days set');
  });

  it('ignores duplicates and out-of-range numbers', () => {
    expect(describeWorkingDays([1, 1, 2, 2])).toBe('Mon, Tue');
    expect(describeWorkingDays([1, 2, 3, 4, 5, 9, -1])).toBe('Mon\u2013Fri');
    expect(describeWorkingDays([99])).toBe('No working days set');
  });
});

describe('working day helpers', () => {
  it('identifies working days against getUTCDay numbering', () => {
    expect(isWorkingDay('2026-08-03', MON_TO_FRI)).toBe(true); // Monday
    expect(isWorkingDay('2026-08-07', MON_TO_FRI)).toBe(true); // Friday
    expect(isWorkingDay('2026-08-08', MON_TO_FRI)).toBe(false); // Saturday
    expect(isWorkingDay('2026-08-09', MON_TO_FRI)).toBe(false); // Sunday
    expect(isWorkingDay('2026-08-08', MON_TO_SAT)).toBe(true);
  });

  it('counts working days inclusively across whole weeks', () => {
    // Mon 3rd to Fri 28th.
    expect(countWorkingDays('2026-08-03', '2026-08-28', MON_TO_FRI)).toBe(20);
    expect(countWorkingDays('2026-08-03', '2026-08-28', MON_TO_SAT)).toBe(23);
    // A single Monday.
    expect(countWorkingDays('2026-08-03', '2026-08-03', MON_TO_FRI)).toBe(1);
    // A weekend on its own.
    expect(countWorkingDays('2026-08-08', '2026-08-09', MON_TO_FRI)).toBe(0);
  });

  it('returns 0 for a reversed range or an empty working week', () => {
    expect(countWorkingDays('2026-08-28', '2026-08-03', MON_TO_FRI)).toBe(0);
    expect(countWorkingDays('2026-08-03', '2026-08-28', [])).toBe(0);
  });

  it('enumerates the working days it counts', () => {
    expect(enumerateWorkingDays('2026-08-07', '2026-08-10', MON_TO_FRI)).toEqual([
      '2026-08-07',
      '2026-08-10',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Attendance summary
// ---------------------------------------------------------------------------

describe('summariseSubmissions', () => {
  it('returns the zeroed summary for no submissions and no window', () => {
    expect(summariseSubmissions([])).toEqual(emptyAttendanceSummary());
  });

  // -- The starting point -------------------------------------------------

  it('is 100% on the first morning, before anything has been answered', () => {
    const summary = summariseSubmissions([], fourWeeks('2026-08-03'));

    expect(summary.internshipDays).toBe(20);
    // Today has not closed, so nothing is missed yet.
    expect(summary.elapsedDays).toBe(0);
    expect(summary.daysAbsent).toBe(0);
    expect(summary.attendancePercentage).toBe(100);
  });

  it('stays at 100% while every closed day was answered and approved', () => {
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'approved' },
      ],
      fourWeeks('2026-08-05'),
    );

    expect(summary.daysApproved).toBe(2);
    expect(summary.daysAbsent).toBe(0);
    expect(summary.attendancePercentage).toBe(100);
  });

  // -- Losing ground ------------------------------------------------------

  it('takes one internship day off the total for a day missed entirely', () => {
    const summary = summariseSubmissions(
      // Monday never answered; Tuesday answered and approved.
      [{ submissionDate: '2026-08-04', status: 'approved' }],
      fourWeeks('2026-08-05'),
    );

    expect(summary.daysNotAnswered).toBe(1);
    expect(summary.daysAbsent).toBe(1);
    // One of twenty internship days lost.
    expect(summary.attendancePercentage).toBe(95);
  });

  it('counts a declined closed day as absent', () => {
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'declined' },
        { submissionDate: '2026-08-04', status: 'approved' },
      ],
      fourWeeks('2026-08-05'),
    );

    expect(summary.daysDeclined).toBe(1);
    // Declined, not merely unanswered.
    expect(summary.daysNotAnswered).toBe(0);
    expect(summary.daysAbsent).toBe(1);
    expect(summary.attendancePercentage).toBe(95);
  });

  it('scales the loss with the number of days missed', () => {
    // Nothing answered at all, three working days closed.
    const summary = summariseSubmissions([], fourWeeks('2026-08-06'));

    expect(summary.elapsedDays).toBe(3);
    expect(summary.daysAbsent).toBe(3);
    expect(summary.attendancePercentage).toBe(85);
  });

  // -- What must never cost the student anything --------------------------

  it('does not count today as absent while it is still answerable', () => {
    const summary = summariseSubmissions(
      [{ submissionDate: '2026-08-03', status: 'approved' }],
      // Tuesday, with Tuesday not yet answered.
      fourWeeks('2026-08-04'),
    );

    expect(summary.elapsedDays).toBe(1);
    expect(summary.daysAbsent).toBe(0);
    expect(summary.attendancePercentage).toBe(100);
  });

  it('does not count a day awaiting review as absent', () => {
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'pending' },
        { submissionDate: '2026-08-05', status: 'pending' },
      ],
      fourWeeks('2026-08-06'),
    );

    expect(summary.daysPending).toBe(2);
    // The student answered in time; the review queue is not their conduct.
    expect(summary.daysAbsent).toBe(0);
    expect(summary.attendancePercentage).toBe(100);
  });

  it('does not count a non-working day as absent', () => {
    // Monday 10th, so the weekend of the 8th and 9th has closed unanswered.
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'approved' },
        { submissionDate: '2026-08-05', status: 'approved' },
        { submissionDate: '2026-08-06', status: 'approved' },
        { submissionDate: '2026-08-07', status: 'approved' },
      ],
      fourWeeks('2026-08-10'),
    );

    expect(summary.elapsedDays).toBe(5);
    expect(summary.daysAbsent).toBe(0);
    expect(summary.attendancePercentage).toBe(100);
  });

  it('does count a missed Saturday when Saturday is a working day', () => {
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'approved' },
        { submissionDate: '2026-08-05', status: 'approved' },
        { submissionDate: '2026-08-06', status: 'approved' },
        { submissionDate: '2026-08-07', status: 'approved' },
      ],
      fourWeeks('2026-08-10', MON_TO_SAT),
    );

    // Saturday the 8th closed unanswered; Sunday the 9th still does not count.
    expect(summary.elapsedDays).toBe(6);
    expect(summary.daysAbsent).toBe(1);
    expect(summary.internshipDays).toBe(23);
    expect(summary.attendancePercentage).toBe(95.7);
  });

  it('gives no credit for answering on a non-working day', () => {
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'approved' },
        { submissionDate: '2026-08-05', status: 'approved' },
        { submissionDate: '2026-08-06', status: 'approved' },
        { submissionDate: '2026-08-07', status: 'approved' },
        // A Saturday, outside the student's working week.
        { submissionDate: '2026-08-08', status: 'approved' },
      ],
      { startDate: '2026-08-03', endDate: '2026-08-07', today: '2026-08-10', workingDays: MON_TO_FRI },
    );

    // Five approved, not six — the extra day cannot push anyone past 100%.
    expect(summary.daysApproved).toBe(5);
    expect(summary.daysSubmitted).toBe(5);
    expect(summary.attendancePercentage).toBe(100);
  });

  // -- Recovery -----------------------------------------------------------

  it('gives the percentage back once a missed day is approved on retake', () => {
    const window = fourWeeks('2026-08-05');

    const missed = summariseSubmissions(
      [{ submissionDate: '2026-08-04', status: 'approved' }],
      window,
    );
    expect(missed.attendancePercentage).toBe(95);

    // The same window, with the missed Monday now answered and approved.
    const recovered = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'approved' },
      ],
      window,
    );
    expect(recovered.daysAbsent).toBe(0);
    expect(recovered.attendancePercentage).toBe(100);
  });

  it('reports which absent days a retake could still recover', () => {
    const summary = summariseSubmissions(
      [{ submissionDate: '2026-08-05', status: 'approved' }],
      { ...fourWeeks('2026-08-06'), retakeOpenDates: ['2026-08-03'] },
    );

    expect(summary.daysAbsent).toBe(2);
    // A subset of the absent days, not an addition to them.
    expect(summary.daysRecoverable).toBe(1);
    // Granting a retake does not itself restore the percentage.
    expect(summary.attendancePercentage).toBe(90);
  });

  // -- Window edges -------------------------------------------------------

  it('freezes the denominator once the internship has ended', () => {
    const summary = summariseSubmissions(
      [
        { submissionDate: '2026-08-03', status: 'approved' },
        { submissionDate: '2026-08-04', status: 'approved' },
        { submissionDate: '2026-08-05', status: 'approved' },
        { submissionDate: '2026-08-06', status: 'approved' },
        { submissionDate: '2026-08-07', status: 'approved' },
      ],
      // Two months after a one week internship.
      { startDate: '2026-08-03', endDate: '2026-08-07', today: '2026-10-11', workingDays: MON_TO_FRI },
    );

    expect(summary.internshipDays).toBe(5);
    expect(summary.elapsedDays).toBe(5);
    expect(summary.daysAbsent).toBe(0);
    expect(summary.attendancePercentage).toBe(100);
  });

  it('measures against elapsed days when no end date is recorded', () => {
    const summary = summariseSubmissions(
      [{ submissionDate: '2026-08-03', status: 'approved' }],
      // Wednesday, with Tuesday missed and no known internship length.
      { startDate: '2026-08-03', endDate: null, today: '2026-08-05', workingDays: MON_TO_FRI },
    );

    // Mon, Tue, Wed — today included, since the length is otherwise unknowable.
    expect(summary.internshipDays).toBe(3);
    expect(summary.daysAbsent).toBe(1);
    expect(summary.attendancePercentage).toBe(66.7);
  });

  it('falls back to the first submission when the student has no start date', () => {
    const summary = summariseSubmissions(
      [{ submissionDate: '2026-08-10', status: 'approved' }],
      { startDate: null, endDate: null, today: '2026-08-12', workingDays: MON_TO_FRI },
    );

    // Anchored on Monday the 10th: Mon, Tue, Wed.
    expect(summary.internshipDays).toBe(3);
    // Tuesday closed unanswered.
    expect(summary.daysAbsent).toBe(1);
    expect(summary.attendancePercentage).toBe(66.7);
  });

  it('never reports a negative percentage', () => {
    const summary = summariseSubmissions(
      [],
      { startDate: '2026-08-03', endDate: null, today: '2026-08-07', workingDays: MON_TO_FRI },
    );

    expect(summary.daysAbsent).toBe(4);
    expect(summary.attendancePercentage).toBe(20);
    expect(summary.attendancePercentage).toBeGreaterThanOrEqual(0);
  });

  it('reports no percentage when there is nothing to measure', () => {
    const summary = summariseSubmissions(
      [],
      { startDate: null, endDate: null, today: '2026-08-10', workingDays: MON_TO_FRI },
    );

    expect(summary.internshipDays).toBe(0);
    expect(summary.attendancePercentage).toBeNull();
  });

  it('reports no percentage when the internship has not started', () => {
    const summary = summariseSubmissions(
      [],
      { startDate: '2026-09-01', endDate: null, today: '2026-08-10', workingDays: MON_TO_FRI },
    );

    expect(summary.internshipDays).toBe(0);
    expect(summary.attendancePercentage).toBeNull();
  });

  // -- Bookkeeping --------------------------------------------------------

  it('carries the working days it measured against, for display', () => {
    expect(summariseSubmissions([], fourWeeks('2026-08-05')).workingDays).toEqual(MON_TO_FRI);
    expect(
      summariseSubmissions([], fourWeeks('2026-08-05', MON_TO_SAT)).workingDays,
    ).toEqual(MON_TO_SAT);
  });

  it('reports the first and last dates regardless of input order', () => {
    const summary = summariseSubmissions([
      { submissionDate: '2026-08-14', status: 'approved' },
      { submissionDate: '2026-08-10', status: 'approved' },
      { submissionDate: '2026-08-12', status: 'approved' },
    ]);
    expect(summary.firstSubmissionDate).toBe('2026-08-10');
    expect(summary.lastSubmissionDate).toBe('2026-08-14');
  });

  it('collapses a duplicated date to its strongest status instead of double counting', () => {
    const summary = summariseSubmissions([
      { submissionDate: '2026-08-10', status: 'declined' },
      { submissionDate: '2026-08-10', status: 'approved' },
    ]);
    expect(summary.daysSubmitted).toBe(1);
    expect(summary.daysApproved).toBe(1);
    expect(summary.daysDeclined).toBe(0);
  });

  it('counts only declined days as absent when there is no window to compare against', () => {
    const summary = summariseSubmissions([
      { submissionDate: '2026-08-10', status: 'approved' },
      { submissionDate: '2026-08-11', status: 'declined' },
    ]);

    // Never-answered days are undetectable with no calendar.
    expect(summary.daysNotAnswered).toBe(0);
    expect(summary.daysAbsent).toBe(1);
    expect(summary.attendancePercentage).toBe(50);
  });
});

describe('countInternshipDays', () => {
  it('counts the working days between the start and end dates', () => {
    expect(
      countInternshipDays(
        { startDate: '2026-08-03', endDate: '2026-08-28', today: '2026-08-05', workingDays: MON_TO_FRI },
        null,
      ),
    ).toBe(20);
  });

  it('runs to today when no end date is recorded', () => {
    expect(
      countInternshipDays(
        { startDate: '2026-08-03', endDate: null, today: '2026-08-03', workingDays: MON_TO_FRI },
        null,
      ),
    ).toBe(1);
  });

  it('returns 0 when there is no start date and no submission to anchor on', () => {
    expect(
      countInternshipDays(
        { startDate: null, endDate: null, today: '2026-08-10', workingDays: MON_TO_FRI },
        null,
      ),
    ).toBe(0);
  });

  it('returns 0 when the internship has not started yet', () => {
    expect(
      countInternshipDays(
        { startDate: '2026-09-01', endDate: null, today: '2026-08-10', workingDays: MON_TO_FRI },
        null,
      ),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Answer completeness
// ---------------------------------------------------------------------------

describe('findMissingRequiredAnswers', () => {
  const questions = [
    { id: 'q1', required: true },
    { id: 'q2', required: false },
    { id: 'q3', required: true },
  ];

  it('finds required questions with no answer at all', () => {
    expect(findMissingRequiredAnswers(questions, [{ questionId: 'q1', answerText: 'done' }])).toEqual(
      ['q3'],
    );
  });

  it('treats a whitespace-only answer as missing', () => {
    expect(
      findMissingRequiredAnswers(questions, [
        { questionId: 'q1', answerText: '   ' },
        { questionId: 'q3', answerText: 'ok' },
      ]),
    ).toEqual(['q1']);
  });

  it('ignores optional questions', () => {
    expect(
      findMissingRequiredAnswers(questions, [
        { questionId: 'q1', answerText: 'a' },
        { questionId: 'q3', answerText: 'b' },
      ]),
    ).toEqual([]);
  });
});

describe('findUnknownAnswers', () => {
  it('flags answers for questions that were not offered', () => {
    expect(
      findUnknownAnswers([{ id: 'q1' }], [{ questionId: 'q1' }, { questionId: 'ghost' }]),
    ).toEqual(['ghost']);
  });
});

// ---------------------------------------------------------------------------
// Answer validators derived from question definitions
// ---------------------------------------------------------------------------

describe('answerValidatorFor', () => {
  it('enforces the character minimum for a type with no word bounds', () => {
    const validator = answerValidatorFor({
      type: 'unknown_type',
      required: true,
      options: null,
      minLength: 20,
      maxLength: 100,
    });

    expect(validator.safeParse('too short').success).toBe(false);
    expect(validator.safeParse('this answer is definitely long enough').success).toBe(true);
  });

  // The written limit on free text is a word count derived from the question type. A
  // character cap stored on the question is deliberately not applied to those types.
  describe('word limits on free text', () => {
    const words = (count: number): string =>
      Array.from({ length: count }, () => 'word').join(' ');

    const textValidator = answerValidatorFor({
      type: 'text',
      required: true,
      options: null,
      minLength: null,
      maxLength: null,
    });

    const longTextValidator = answerValidatorFor({
      type: 'long_text',
      required: true,
      options: null,
      minLength: null,
      maxLength: null,
    });

    it('allows exactly the ceiling and rejects one word over', () => {
      expect(textValidator.safeParse(words(SHORT_ANSWER_MAX_WORDS)).success).toBe(true);
      expect(textValidator.safeParse(words(SHORT_ANSWER_MAX_WORDS + 1)).success).toBe(false);

      expect(longTextValidator.safeParse(words(LONG_ANSWER_MAX_WORDS)).success).toBe(true);
      expect(longTextValidator.safeParse(words(LONG_ANSWER_MAX_WORDS + 1)).success).toBe(false);
    });

    it('allows exactly the floor and rejects one word under', () => {
      expect(textValidator.safeParse(words(SHORT_ANSWER_MIN_WORDS)).success).toBe(true);
      expect(textValidator.safeParse(words(SHORT_ANSWER_MIN_WORDS - 1)).success).toBe(false);

      expect(longTextValidator.safeParse(words(LONG_ANSWER_MIN_WORDS)).success).toBe(true);
      expect(longTextValidator.safeParse(words(LONG_ANSWER_MIN_WORDS - 1)).success).toBe(false);
    });

    it('gives a paragraph a higher floor than short text', () => {
      // Clears short text's minimum but not a paragraph's.
      const between = words(SHORT_ANSWER_MIN_WORDS + 5);
      expect(textValidator.safeParse(between).success).toBe(true);
      expect(longTextValidator.safeParse(between).success).toBe(false);
    });

    it('reports the floor in words', () => {
      const result = longTextValidator.safeParse(words(4));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          `Write at least ${LONG_ANSWER_MIN_WORDS} words. You have 4.`,
        );
      }
    });

    it('applies no floor to an optional question, so a short answer is still accepted', () => {
      const optional = answerValidatorFor({
        type: 'long_text',
        required: false,
        options: null,
        minLength: null,
        maxLength: null,
      });
      expect(optional.safeParse(words(2)).success).toBe(true);
      // The ceiling still applies.
      expect(optional.safeParse(words(LONG_ANSWER_MAX_WORDS + 1)).success).toBe(false);
    });

    it('gives short text a smaller allowance than a paragraph', () => {
      const between = words(SHORT_ANSWER_MAX_WORDS + 50);
      expect(textValidator.safeParse(between).success).toBe(false);
      expect(longTextValidator.safeParse(between).success).toBe(true);
    });

    it('ignores a stored character minimum, so only the word floor applies', () => {
      const capped = answerValidatorFor({
        type: 'text',
        required: true,
        options: null,
        // Far more characters than 10 words of "word" provides. The old rule would have
        // rejected this.
        minLength: 500,
        maxLength: null,
      });
      expect(capped.safeParse(words(SHORT_ANSWER_MIN_WORDS)).success).toBe(true);
    });

    it('reports the word count in the message, not a character count', () => {
      const result = textValidator.safeParse(words(SHORT_ANSWER_MAX_WORDS + 3));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          `Keep it to ${SHORT_ANSWER_MAX_WORDS} words or fewer. You have ${SHORT_ANSWER_MAX_WORDS + 3}.`,
        );
      }
    });

    it('ignores a stored character cap, so the counter cannot disagree with the rule', () => {
      const capped = answerValidatorFor({
        type: 'long_text',
        required: true,
        options: null,
        minLength: null,
        // Well under what 200 words needs. The old rule would have rejected this.
        maxLength: 50,
      });
      expect(capped.safeParse(words(120)).success).toBe(true);
    });

    it('still refuses one unbroken string, which counts as a single word', () => {
      // Optional, so the word floor cannot be what rejects it: this isolates the
      // character ceiling that exists for exactly this case.
      const optional = answerValidatorFor({
        type: 'text',
        required: false,
        options: null,
        minLength: null,
        maxLength: null,
      });
      const oneHugeWord = 'x'.repeat(ANSWER_HARD_MAX_LENGTH + 1);

      expect(countWords(oneHugeWord)).toBe(1);
      expect(optional.safeParse(oneHugeWord).success).toBe(false);
    });

    it('leaves the character bound in place for types with no word limit', () => {
      const numberish = answerValidatorFor({
        type: 'unknown_type',
        required: true,
        options: null,
        minLength: null,
        maxLength: 10,
      });
      expect(numberish.safeParse('12345678901').success).toBe(false);
      expect(numberish.safeParse('1234567890').success).toBe(true);
    });
  });

  it('accepts blank for an optional question', () => {
    const validator = answerValidatorFor({
      type: 'long_text',
      required: false,
      options: null,
      minLength: 50,
      maxLength: 100,
    });
    expect(validator.safeParse('').success).toBe(true);
  });

  it('restricts a choice answer to the offered options', () => {
    const validator = answerValidatorFor({
      type: 'choice',
      required: true,
      options: ['Yes', 'No'],
      minLength: null,
      maxLength: null,
    });

    expect(validator.safeParse('Yes').success).toBe(true);
    expect(validator.safeParse('Maybe').success).toBe(false);
  });

  it('accepts numeric strings for a number question and rejects text', () => {
    const validator = answerValidatorFor({
      type: 'number',
      required: true,
      options: null,
      minLength: null,
      maxLength: null,
    });

    expect(validator.safeParse('7').success).toBe(true);
    expect(validator.safeParse('7.5').success).toBe(true);
    expect(validator.safeParse('-3').success).toBe(true);
    expect(validator.safeParse('seven').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Whole-submission validation
// ---------------------------------------------------------------------------

describe('validateAnswersAgainstQuestions', () => {
  const questions: QuestionRule[] = [
    {
      id: 'q1',
      prompt: 'What did you work on today?',
      type: 'long_text',
      required: true,
      options: null,
      minLength: 10,
      maxLength: 500,
    },
    {
      id: 'q2',
      prompt: 'Any blockers?',
      type: 'text',
      required: false,
      options: null,
      minLength: null,
      maxLength: 200,
    },
  ];

  /**
   * An answer that clears `q1`'s 30-word floor.
   *
   * These cases are about whole-submission mechanics — snapshotting, unknown ids, omitting
   * blanks — so the content is filler; it just has to be long enough not to fail for an
   * unrelated reason.
   */
  const validParagraph = Array.from({ length: LONG_ANSWER_MIN_WORDS }, () => 'word').join(' ');

  it('returns validated answers with the prompt snapshotted', () => {
    const result = validateAnswersAgainstQuestions(questions, [
      { questionId: 'q1', answerText: validParagraph },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.answers).toHaveLength(1);
    expect(result.answers[0]?.promptSnapshot).toBe('What did you work on today?');
  });

  it('reports a missing required answer against its question id', () => {
    const result = validateAnswersAgainstQuestions(questions, [
      { questionId: 'q2', answerText: 'none' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.q1).toMatch(/required/iu);
  });

  it('rejects an answer to a question that was not offered', () => {
    const result = validateAnswersAgainstQuestions(questions, [
      { questionId: 'q1', answerText: validParagraph },
      { questionId: 'ghost', answerText: 'unexpected' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.ghost).toBeDefined();
  });

  it('omits an unanswered optional question rather than writing a blank row', () => {
    const result = validateAnswersAgainstQuestions(questions, [
      { questionId: 'q1', answerText: validParagraph },
      { questionId: 'q2', answerText: '   ' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.map((a) => a.questionId)).toEqual(['q1']);
  });

  it('surfaces a per-question length failure', () => {
    const result = validateAnswersAgainstQuestions(questions, [
      { questionId: 'q1', answerText: 'short' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.q1).toMatch(new RegExp(`at least ${LONG_ANSWER_MIN_WORDS} words`, 'iu'));
  });
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

describe('submitAnswersSchema', () => {
  it('rejects the same question answered twice', () => {
    const result = submitAnswersSchema.safeParse({
      answers: [
        { questionId: '11111111-1111-4111-8111-111111111111', answerText: 'a' },
        { questionId: '11111111-1111-4111-8111-111111111111', answerText: 'b' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty answer list', () => {
    expect(submitAnswersSchema.safeParse({ answers: [] }).success).toBe(false);
  });

  it('defaults documentIds to an empty array', () => {
    const result = submitAnswersSchema.safeParse({
      answers: [{ questionId: '11111111-1111-4111-8111-111111111111', answerText: 'a' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.documentIds).toEqual([]);
  });
});

describe('reviewSubmissionSchema', () => {
  it('accepts an approval with no note', () => {
    expect(reviewSubmissionSchema.safeParse({ decision: 'approved' }).success).toBe(true);
  });

  it('requires a reason when declining', () => {
    const result = reviewSubmissionSchema.safeParse({ decision: 'declined' });
    expect(result.success).toBe(false);
  });

  it('rejects a decline whose reason is too short to be useful', () => {
    expect(reviewSubmissionSchema.safeParse({ decision: 'declined', note: 'no' }).success).toBe(
      false,
    );
  });

  it('accepts a decline with a real reason', () => {
    expect(
      reviewSubmissionSchema.safeParse({
        decision: 'declined',
        note: 'The photo is unreadable, please re-upload.',
      }).success,
    ).toBe(true);
  });

  // Declining a closed day without reopening it leaves the student with a permanent
  // absence and feedback they cannot act on, so the reviewer is asked as part of the
  // decision rather than in a separate step.
  it('defaults to not granting a retake', () => {
    const result = reviewSubmissionSchema.safeParse({ decision: 'approved' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.grantRetake).toBe(false);
  });

  it('accepts a decline that also grants a retake', () => {
    const result = reviewSubmissionSchema.safeParse({
      decision: 'declined',
      note: 'Please describe the testing you actually ran.',
      grantRetake: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.grantRetake).toBe(true);
  });

  it('refuses a retake alongside an approval, rather than ignoring it', () => {
    // An approved day already counts present, so there is nothing to retake. Silently
    // dropping the flag would let a caller believe a retake had been granted.
    const result = reviewSubmissionSchema.safeParse({
      decision: 'approved',
      grantRetake: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['grantRetake']);
    }
  });
});

describe('createQuestionSchema', () => {
  it('requires at least two options for a choice question', () => {
    const result = createQuestionSchema.safeParse({
      prompt: 'Did you attend?',
      type: 'choice',
      options: ['Yes'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects options on a non-choice question', () => {
    const result = createQuestionSchema.safeParse({
      prompt: 'Describe your day',
      type: 'long_text',
      options: ['Yes', 'No'],
    });
    expect(result.success).toBe(false);
  });

  it('de-duplicates choice options case-insensitively, keeping the first spelling', () => {
    const result = createQuestionSchema.safeParse({
      prompt: 'Did you attend?',
      type: 'choice',
      options: ['Yes', 'yes', 'No'],
    });

    // Two identical options would render as two identical radio buttons, so the
    // duplicate is dropped. Two distinct options remain, which is still valid.
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.options).toEqual(['Yes', 'No']);
  });

  it('rejects a choice question whose options collapse to fewer than two', () => {
    const result = createQuestionSchema.safeParse({
      prompt: 'Did you attend?',
      type: 'choice',
      options: ['Yes', 'YES', '  yes  '],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a min length greater than the max', () => {
    const result = createQuestionSchema.safeParse({
      prompt: 'Describe your day',
      minLength: 100,
      maxLength: 50,
    });
    expect(result.success).toBe(false);
  });

  it('defaults type to long_text and required to true', () => {
    const result = createQuestionSchema.safeParse({ prompt: 'What did you do today?' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('long_text');
    expect(result.data.required).toBe(true);
  });
});
