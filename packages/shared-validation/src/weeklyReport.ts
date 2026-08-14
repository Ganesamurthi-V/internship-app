/**
 * Weekly report schemas — 01_PRD §4.4, 02_SRS §2.4, 05_API_Spec.
 *
 * `daysAttended` and `totalHours` are absent by design. 02_SRS §2.4 states the
 * student "cannot override without faculty unlock", and 08_Implementation_Plan
 * Phase 4 requires aggregation to be "server-side, not client-trusted", so those
 * two values are never accepted from the request body at all.
 */

import { z } from 'zod';
import { optionalText, tagArraySchema, uuidSchema } from './common';

const weeklyReportFields = {
  internshipId: uuidSchema,
  weekNumber: z
    .number()
    .int({ message: 'Week number must be a whole number.' })
    .min(1, { message: 'Week number must be 1 or greater.' })
    .max(104, { message: 'Week number is out of range.' }),
  majorActivities: optionalText('Major activities', 4_000),
  technologiesLearned: tagArraySchema,
  skillsDeveloped: tagArraySchema,
  majorAssignment: optionalText('Major assignment', 2_000),
  problems: optionalText('Problems encountered', 2_000),
  solutions: optionalText('Solutions or approach', 2_000),
  learningOutcomes: optionalText('Key learning outcomes', 2_000),
  mentorFeedback: optionalText('Mentor feedback', 2_000),
  studentSelfAssessment: optionalText('Self assessment', 2_000),
  reportDocumentId: uuidSchema.nullable().optional(),
};

export const createWeeklyReportSchema = z.object(weeklyReportFields);
export type CreateWeeklyReportInput = z.infer<typeof createWeeklyReportSchema>;

export const updateWeeklyReportSchema = z
  .object(weeklyReportFields)
  .omit({ internshipId: true, weekNumber: true })
  .partial();
export type UpdateWeeklyReportInput = z.infer<typeof updateWeeklyReportSchema>;

/**
 * Submission gate. 06_App_Flow §5 lists "Upload weekly PDF (required for
 * submission)", so the document id is mandatory at submit time even though it is
 * optional while the report is a draft.
 */
export const submitWeeklyReportSchema = z.object({
  reportDocumentId: uuidSchema.nullable().optional(),
});
export type SubmitWeeklyReportInput = z.infer<typeof submitWeeklyReportSchema>;

export const weeklyReportListQuerySchema = z.object({
  internshipId: uuidSchema,
});
export type WeeklyReportListQueryInput = z.infer<typeof weeklyReportListQuerySchema>;

export const currentWeekQuerySchema = z.object({
  internshipId: uuidSchema,
});
export type CurrentWeekQueryInput = z.infer<typeof currentWeekQuerySchema>;
