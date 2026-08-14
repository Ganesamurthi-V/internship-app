/**
 * Attendance schemas — 01_PRD §4.2, 02_SRS §2.2, 05_API_Spec "Attendance".
 */

import { z } from 'zod';
import {
  ATTENDANCE_MODES,
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUSES_REQUIRING_REASON,
  type AttendanceStatus,
} from '@ims/shared-types';
import { timeToMinutes } from './calculations';
import {
  booleanQuerySchema,
  dateOnlySchema,
  optionalText,
  timeOnlySchema,
  uuidSchema,
} from './common';

/** Exported so the batch sync schema can require `clientId` without duplication. */
export const attendanceFields = {
  internshipId: uuidSchema,
  date: dateOnlySchema,
  status: z.enum(ATTENDANCE_STATUSES, {
    errorMap: () => ({ message: 'Select an attendance status.' }),
  }),
  reportingTime: timeOnlySchema.nullable().optional(),
  leavingTime: timeOnlySchema.nullable().optional(),
  mode: z.enum(ATTENDANCE_MODES).nullable().optional(),
  leaveReason: optionalText('Reason', 1_000),
  /**
   * 02_SRS §2.2 — proof is optional and must never block submission. It is
   * accepted here purely as an optional association.
   */
  proofDocumentId: uuidSchema.nullable().optional(),
  /** Device-generated idempotency key; absent for records created online. */
  clientId: uuidSchema.nullable().optional(),
};

interface AttendanceTimeShape {
  status?: AttendanceStatus;
  reportingTime?: string | null;
  leavingTime?: string | null;
  leaveReason?: string | null;
}

/**
 * Cross-field rules, applied to both create and update.
 *
 * Deliberately *not* enforced: that `present` must carry times. A student may
 * legitimately record attendance before knowing their leaving time, and 02_SRS
 * §2.2 only auto-calculates hours when both are present.
 */
export function refineAttendance(value: AttendanceTimeShape, ctx: z.RefinementCtx): void {
  // `valid_times` CHECK constraint: leaving must be strictly after reporting.
  if (value.reportingTime && value.leavingTime) {
    if (timeToMinutes(value.leavingTime) <= timeToMinutes(value.reportingTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Leaving time must be later than reporting time.',
        path: ['leavingTime'],
      });
    }
  }

  // A leaving time with no reporting time cannot produce total hours.
  if (value.leavingTime && !value.reportingTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter the reporting time as well.',
      path: ['reportingTime'],
    });
  }

  // 02_SRS §2.2 — "Leave/absence requires a reason field".
  if (
    value.status &&
    ATTENDANCE_STATUSES_REQUIRING_REASON.includes(value.status) &&
    !value.leaveReason
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Give a reason for the absence or leave.',
      path: ['leaveReason'],
    });
  }
}

export const createAttendanceSchema = z.object(attendanceFields).superRefine(refineAttendance);
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;

export const updateAttendanceSchema = z
  .object(attendanceFields)
  .omit({ internshipId: true })
  .partial()
  .superRefine(refineAttendance);
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;

export const attendanceListQuerySchema = z
  .object({
    internshipId: uuidSchema,
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The "from" date must be on or before the "to" date.',
    path: ['from'],
  });
export type AttendanceListQueryInput = z.infer<typeof attendanceListQuerySchema>;

export const attendanceSummaryQuerySchema = z.object({
  internshipId: uuidSchema,
  /** Optional cut-off, used by weekly aggregation. Defaults to today. */
  asOf: dateOnlySchema.optional(),
});
export type AttendanceSummaryQueryInput = z.infer<typeof attendanceSummaryQuerySchema>;

/**
 * Mentor verification is a soft confirmation (02_SRS §2.2). Passing `false`
 * withdraws a previous verification rather than deleting the record.
 */
export const verifyAttendanceSchema = z.object({
  verified: booleanQuerySchema.default(true),
});
export type VerifyAttendanceInput = z.infer<typeof verifyAttendanceSchema>;
