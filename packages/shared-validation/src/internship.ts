/**
 * Internship registration schemas — 01_PRD §4.1, 02_SRS §2.1, 05_API_Spec.
 */

import { z } from 'zod';
import { INTERNSHIP_DOMAINS, INTERNSHIP_MODES, INTERNSHIP_STATUSES } from '@ims/shared-types';
import { daysBetween } from './calculations';
import {
  dateOnlySchema,
  emailSchema,
  mobileSchema,
  optionalText,
  paginationQuerySchema,
  uuidSchema,
} from './common';

/**
 * `NUMERIC(4,2)` in the database, so at most two decimals and below 100.
 * Capped at 24 because a day cannot contain more hours than that, and a positive
 * value is required by 02_SRS §2.1.
 */
export const workingHoursPerDaySchema = z
  .number({ invalid_type_error: 'Enter the working hours per day.' })
  .positive({ message: 'Working hours per day must be greater than zero.' })
  .max(24, { message: 'Working hours per day cannot exceed 24.' })
  .refine((value) => Number.isInteger(value * 100), {
    message: 'Working hours may have at most two decimal places.',
  });

/**
 * Shared by create and update. Kept as a plain object (not refined) so `.partial()`
 * still works for PATCH; the cross-field rules are applied by the wrappers below.
 */
const internshipFields = {
  organisationId: uuidSchema.nullable().optional(),
  organisationName: z.string().trim().min(2, { message: 'Organisation name is required.' }).max(200).optional(),
  organisationLocation: z.string().trim().max(200).optional(),
  mentorName: z.string().trim().min(2, { message: 'Mentor name is required.' }).max(120).optional(),
  mentorDesignation: z.string().trim().max(120).optional(),
  mentorEmail: emailSchema.optional(),
  mentorContact: mobileSchema.optional(),
  domain: z.enum(INTERNSHIP_DOMAINS, {
    errorMap: () => ({ message: 'Select an internship domain.' }),
  }),
  mode: z.enum(INTERNSHIP_MODES, { errorMap: () => ({ message: 'Select the internship mode.' }) }),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  workingHoursPerDay: workingHoursPerDaySchema,
  facultyCoordinatorId: uuidSchema.nullable().optional(),
};

/** `end_date >= start_date` — the `valid_dates` CHECK constraint, checked early. */
function refineDateOrder<T extends { startDate?: string; endDate?: string }>(
  value: T,
  ctx: z.RefinementCtx,
): void {
  if (!value.startDate || !value.endDate) return;
  if (daysBetween(value.startDate, value.endDate) < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be on or after the start date.',
      path: ['endDate'],
    });
  }
}

/**
 * An organisation must be identifiable either by id (picked from the list) or by
 * name (typed in, upserted server-side). 05_API_Spec shows both fields present.
 */
function refineOrganisation<T extends { organisationId?: string | null; organisationName?: string }>(
  value: T,
  ctx: z.RefinementCtx,
): void {
  if (!value.organisationId && !value.organisationName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select an existing organisation or enter its name.',
      path: ['organisationName'],
    });
  }
}

export const createInternshipSchema = z
  .object(internshipFields)
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx);
    refineOrganisation(value, ctx);
  });
export type CreateInternshipInput = z.infer<typeof createInternshipSchema>;

export const updateInternshipSchema = z
  .object(internshipFields)
  .partial()
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx);
  });
export type UpdateInternshipInput = z.infer<typeof updateInternshipSchema>;

/**
 * Step-wise schemas for the 3-step registration wizard (06_App_Flow §3), so each
 * step can validate on its own before the student moves forward.
 */
export const internshipStep1Schema = z
  .object({
    organisationId: internshipFields.organisationId,
    organisationName: internshipFields.organisationName,
    organisationLocation: internshipFields.organisationLocation,
    domain: internshipFields.domain,
    mode: internshipFields.mode,
    startDate: internshipFields.startDate,
    endDate: internshipFields.endDate,
    workingHoursPerDay: internshipFields.workingHoursPerDay,
  })
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx);
    refineOrganisation(value, ctx);
  });
export type InternshipStep1Input = z.infer<typeof internshipStep1Schema>;

export const internshipStep2Schema = z.object({
  mentorName: internshipFields.mentorName,
  mentorDesignation: internshipFields.mentorDesignation,
  mentorEmail: internshipFields.mentorEmail,
  mentorContact: internshipFields.mentorContact,
  facultyCoordinatorId: internshipFields.facultyCoordinatorId,
});
export type InternshipStep2Input = z.infer<typeof internshipStep2Schema>;

/**
 * Step 3 gate: 01_PRD §4.1 requires the offer letter and joining proof before
 * the registration can be submitted.
 */
export const internshipStep3Schema = z.object({
  offerLetterDocumentId: uuidSchema.refine((value) => value.length > 0, {
    message: 'Upload the offer or confirmation letter.',
  }),
  joiningProofDocumentId: uuidSchema.refine((value) => value.length > 0, {
    message: 'Upload the joining proof.',
  }),
});
export type InternshipStep3Input = z.infer<typeof internshipStep3Schema>;

// ---------------------------------------------------------------------------
// Approval workflow — faculty only
// ---------------------------------------------------------------------------

export const approveInternshipSchema = z.object({
  note: optionalText('Note', 500),
});
export type ApproveInternshipInput = z.infer<typeof approveInternshipSchema>;

/** A reason is mandatory: the student is shown this text and must be able to act on it. */
export const rejectInternshipSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(10, { message: 'Give the student at least a short explanation (10 characters).' })
    .max(1_000, { message: 'Reason is too long.' }),
});
export type RejectInternshipInput = z.infer<typeof rejectInternshipSchema>;

export const internshipListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INTERNSHIP_STATUSES).optional(),
  departmentId: uuidSchema.optional(),
  organisationId: uuidSchema.optional(),
  facultyCoordinatorId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  search: z.string().trim().max(120).optional(),
});
export type InternshipListQueryInput = z.infer<typeof internshipListQuerySchema>;
