/**
 * Mentor evaluation — 01_PRD §4.7, 02_SRS §2.6.
 *
 * Ten rating parameters, all 1–5. Draft saves accept partial ratings; submission
 * requires all ten plus the digital confirmation that makes the record immutable.
 */

import { z } from 'zod';
import { MENTOR_RATING_FIELDS } from '@ims/shared-types';
import { optionalText, ratingSchema, uuidSchema } from './common';

/** The ten parameters as an optional-rating object, for draft saves. */
const draftRatingFields = Object.fromEntries(
  MENTOR_RATING_FIELDS.map((field) => [field, ratingSchema.nullable().optional()]),
) as Record<(typeof MENTOR_RATING_FIELDS)[number], z.ZodOptional<z.ZodNullable<typeof ratingSchema>>>;

/** The same ten parameters, all mandatory, for submission. */
const requiredRatingFields = Object.fromEntries(
  MENTOR_RATING_FIELDS.map((field) => [field, ratingSchema]),
) as Record<(typeof MENTOR_RATING_FIELDS)[number], typeof ratingSchema>;

const textFields = {
  strengths: optionalText('Major strengths', 2_000),
  improvementAreas: optionalText('Areas for improvement', 2_000),
  remarks: optionalText('Overall remarks', 2_000),
  employmentRecommendation: z.boolean().nullable().optional(),
};

export const upsertMentorEvaluationSchema = z.object({
  internshipId: uuidSchema,
  ...draftRatingFields,
  ...textFields,
});
export type UpsertMentorEvaluationInput = z.infer<typeof upsertMentorEvaluationSchema>;

export const updateMentorEvaluationSchema = z
  .object({ ...draftRatingFields, ...textFields })
  .partial();
export type UpdateMentorEvaluationInput = z.infer<typeof updateMentorEvaluationSchema>;

/**
 * Submission payload. `digitalConfirmation` is a literal `true` rather than a
 * boolean: 01_PRD §4.7 treats it as the mentor's signature, and 02_SRS §2.6 makes
 * the record immutable once it is set, so an explicit affirmative is required.
 */
export const submitMentorEvaluationSchema = z.object({
  ...requiredRatingFields,
  ...textFields,
  digitalConfirmation: z.literal(true, {
    errorMap: () => ({ message: 'Confirm the evaluation to submit it.' }),
  }),
});
export type SubmitMentorEvaluationInput = z.infer<typeof submitMentorEvaluationSchema>;

export const mentorEvaluationQuerySchema = z.object({
  internshipId: uuidSchema,
});
export type MentorEvaluationQueryInput = z.infer<typeof mentorEvaluationQuerySchema>;

/**
 * Invite tokens are opaque, high-entropy strings generated server-side. Length is
 * bounded to reject obvious junk before hitting the database.
 */
export const mentorInviteTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, { message: 'This invite link is not valid.' })
    .max(256, { message: 'This invite link is not valid.' }),
});
export type MentorInviteTokenInput = z.infer<typeof mentorInviteTokenSchema>;

/** Faculty/admin action to reopen a confirmed evaluation (02_SRS §2.6). */
export const reopenMentorEvaluationSchema = z.object({
  reason: optionalText('Reason', 500),
});
export type ReopenMentorEvaluationInput = z.infer<typeof reopenMentorEvaluationSchema>;
