/**
 * Daily work log schemas — 01_PRD §4.3, 02_SRS §2.3, 05_API_Spec.
 *
 * The two word caps are the headline rules: activities <= 200 words and
 * learning <= 100 words, both surfaced live in the UI by a WordCounter that
 * calls the same `countWords` used here.
 */

import { z } from 'zod';
import {
  COMPLETION_STATUSES,
  DELIVERABLE_TYPES,
  MAX_ACTIVITIES_WORDS,
  MAX_LEARNING_WORDS,
} from '@ims/shared-types';
import { countWords } from './calculations';
import {
  dateOnlySchema,
  optionalText,
  tagArraySchema,
  textField,
  uuidSchema,
} from './common';

/** Required, and capped at 200 words. */
export const activitiesSchema = textField({
  label: 'Activities performed',
  minWords: 1,
  maxWords: MAX_ACTIVITIES_WORDS,
  maxChars: 4_000,
});

/** Optional, and capped at 100 words when provided. */
export const learningSchema = textField({
  label: 'Key learning',
  maxWords: MAX_LEARNING_WORDS,
  maxChars: 2_000,
})
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

/** Exported so the batch sync schema can require `clientId` without duplication. */
export const workLogFields = {
  internshipId: uuidSchema,
  workDate: dateOnlySchema,
  activities: activitiesSchema,
  technologies: tagArraySchema,
  taskAssigned: optionalText('Task assigned', 1_000),
  completionStatus: z.enum(COMPLETION_STATUSES).nullable().optional(),
  learning: learningSchema,
  challenge: optionalText('Problem or challenge', 2_000),
  solution: optionalText('Solution or approach', 2_000),
  deliverableType: z.enum(DELIVERABLE_TYPES).nullable().optional(),
  /** Optional and organisation-permitting (02_SRS §2.3). */
  evidenceDocumentId: uuidSchema.nullable().optional(),
  mentorInteraction: z.boolean().default(false),
  mentorFeedback: optionalText('Mentor feedback', 2_000),
  clientId: uuidSchema.nullable().optional(),
};

export const createWorkLogSchema = z.object(workLogFields);
export type CreateWorkLogInput = z.infer<typeof createWorkLogSchema>;

/**
 * PATCH variant. `activities` becomes optional but keeps its word cap, so a
 * partial edit cannot push the field over 200 words.
 */
export const updateWorkLogSchema = z
  .object(workLogFields)
  .omit({ internshipId: true })
  .partial();
export type UpdateWorkLogInput = z.infer<typeof updateWorkLogSchema>;

export const workLogListQuerySchema = z
  .object({
    internshipId: uuidSchema,
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Searches activities, learning and technology tags (02_SRS §7). */
    search: z.string().trim().max(120).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The "from" date must be on or before the "to" date.',
    path: ['from'],
  });
export type WorkLogListQueryInput = z.infer<typeof workLogListQuerySchema>;

/**
 * Helper for the live counters, so the screen and the schema agree exactly.
 * Returns remaining words, which is what the UI displays.
 */
export function activitiesWordsRemaining(text: string): number {
  return MAX_ACTIVITIES_WORDS - countWords(text);
}

export function learningWordsRemaining(text: string): number {
  return MAX_LEARNING_WORDS - countWords(text);
}
