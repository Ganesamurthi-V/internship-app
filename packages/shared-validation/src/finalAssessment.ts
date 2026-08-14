/**
 * Final assessment and skill self-ratings — 01_PRD §4.5/§4.6, 02_SRS §2.5.
 *
 * Two schemas per shape: a permissive draft schema so students can save partial
 * progress across the 3-step form, and a strict submit schema that enforces the
 * completeness rules. `totalDaysAttended` and `totalHours` are never accepted
 * from the client — they are auto-filled from attendance (01_PRD §4.5).
 */

import { z } from 'zod';
import {
  OBJECTIVES_STATUSES,
  SKILL_TYPES,
  type SkillType,
} from '@ims/shared-types';
import { optionalText, ratingSchema, tagArraySchema, uuidSchema } from './common';

export const skillRatingSchema = z.object({
  skillType: z.enum(SKILL_TYPES),
  rating: ratingSchema,
});
export type SkillRatingInput = z.infer<typeof skillRatingSchema>;

/**
 * All eight axes exactly once. Order does not matter, but neither duplicates nor
 * omissions are allowed once the student submits.
 */
export const completeSkillRatingsSchema = z
  .array(skillRatingSchema)
  .superRefine((ratings, ctx) => {
    const seen = new Set<SkillType>();
    for (const entry of ratings) {
      if (seen.has(entry.skillType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate rating for ${entry.skillType}.`,
        });
      }
      seen.add(entry.skillType);
    }
    const missing = SKILL_TYPES.filter((skill) => !seen.has(skill));
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Rate every skill. Missing: ${missing.join(', ')}.`,
      });
    }
  });

const finalAssessmentFields = {
  internshipId: uuidSchema,
  completedSuccessfully: z.boolean().nullable().optional(),
  majorProject: optionalText('Major project or task', 4_000),
  technologiesMastered: tagArraySchema,
  skillsDeveloped: tagArraySchema,
  objectivesStatus: z.enum(OBJECTIVES_STATUSES).nullable().optional(),
  usefulnessRating: ratingSchema.nullable().optional(),
  technicalImprovement: optionalText('Technical skill improvement', 2_000),
  employabilityImprovement: optionalText('Employability improvement', 2_000),
  curriculumRelation: optionalText('Curriculum relationship', 2_000),
  realWorldExposure: optionalText('Real-world exposure', 2_000),
  recommendOrganisation: z.boolean().nullable().optional(),
  suggestions: optionalText('Suggestions', 2_000),
  /** Partial ratings are allowed while drafting. */
  skillRatings: z.array(skillRatingSchema).max(SKILL_TYPES.length).optional(),
};

export const upsertFinalAssessmentSchema = z.object(finalAssessmentFields);
export type UpsertFinalAssessmentInput = z.infer<typeof upsertFinalAssessmentSchema>;

export const updateFinalAssessmentSchema = z
  .object(finalAssessmentFields)
  .omit({ internshipId: true })
  .partial();
export type UpdateFinalAssessmentInput = z.infer<typeof updateFinalAssessmentSchema>;

/**
 * Submit gate. 02_SRS §2.5 requires the usefulness rating and all skill ratings
 * to be 1–5 and the objectives status to be set. Free-text reflections stay
 * optional — the institution wants them, but an empty box should not block a
 * student from closing out their internship record.
 */
export const submitFinalAssessmentSchema = z.object({
  completedSuccessfully: z.boolean({
    required_error: 'State whether the internship was completed successfully.',
  }),
  objectivesStatus: z.enum(OBJECTIVES_STATUSES, {
    errorMap: () => ({ message: 'Select whether the objectives were achieved.' }),
  }),
  usefulnessRating: ratingSchema,
  majorProject: z
    .string()
    .trim()
    .min(1, { message: 'Describe the major project or task you completed.' }),
  skillRatings: completeSkillRatingsSchema,
});
export type SubmitFinalAssessmentInput = z.infer<typeof submitFinalAssessmentSchema>;

export const finalAssessmentQuerySchema = z.object({
  internshipId: uuidSchema,
});
export type FinalAssessmentQueryInput = z.infer<typeof finalAssessmentQuerySchema>;

/**
 * Faculty action. Serves both early access before the end date and reopening an
 * already-submitted assessment, which 07_Security_and_Privacy §9 classifies as a
 * High-sensitivity audited event — hence the reason field.
 */
export const unlockFinalAssessmentSchema = z.object({
  reason: optionalText('Reason', 500),
});
export type UnlockFinalAssessmentInput = z.infer<typeof unlockFinalAssessmentSchema>;
