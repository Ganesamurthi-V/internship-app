/**
 * Retake schemas — faculty reopening one closed day for one student.
 *
 * A retake is the only way a missed day becomes present, so the rules here are the
 * narrow ones: a single named student, a single named date, a stated reason and a
 * deadline. Everything the grant does *not* say is deliberately not grantable — the
 * service refuses future dates, already-approved days and out-of-scope students, and
 * none of that is expressible in the request.
 */

import { z } from 'zod';
import {
  RETAKE_MAX_WINDOW_DAYS,
  RETAKE_REASON_MAX_LENGTH,
  RETAKE_REASON_MIN_LENGTH,
} from '@ims/shared-types';
import { booleanQuerySchema, dateOnlySchema, textField, uuidSchema } from './common';

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

export const grantRetakeSchema = z
  .object({
    studentId: uuidSchema,

    /** The closed day to reopen. */
    targetDate: dateOnlySchema,

    /**
     * Required, for the same reason a decline note is required: the student is
     * shown this, and it is the justification on the record if the attendance is
     * ever questioned.
     */
    reason: textField({
      label: 'Reason',
      min: RETAKE_REASON_MIN_LENGTH,
      max: RETAKE_REASON_MAX_LENGTH,
    }),

    /**
     * Last day the retake may be used, inclusive. Omitted means the service
     * applies `RETAKE_DEFAULT_WINDOW_DAYS`, computed from the institution clock
     * rather than the device's.
     */
    expiresOn: dateOnlySchema.optional(),
  })
  .refine((value) => !value.expiresOn || value.expiresOn >= value.targetDate, {
    message: 'The deadline cannot be before the day being reopened.',
    path: ['expiresOn'],
  });
export type GrantRetakeInput = z.output<typeof grantRetakeSchema>;

/** Shared with the service, which validates the window against today. */
export const RETAKE_WINDOW_BOUND_DAYS = RETAKE_MAX_WINDOW_DAYS;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const retakeListQuerySchema = z.object({
  /** Reviewers filter to one student; a student always gets only their own. */
  studentId: uuidSchema.optional(),
  /**
   * Revoked and expired grants are hidden by default: the common question is "what
   * can this student still use", not "what has ever been granted".
   */
  includeInactive: booleanQuerySchema.optional().default(false),
});
export type RetakeListQueryInput = z.output<typeof retakeListQuerySchema>;

export const missedDaysQuerySchema = z.object({
  /**
   * Caps how far back the candidate list reaches. Without a bound the list grows
   * with the internship and the reviewer scrolls past days too old to be worth
   * reopening.
   */
  limit: z.coerce.number().int().min(1).max(120).default(60),
});
export type MissedDaysQueryInput = z.output<typeof missedDaysQuerySchema>;
