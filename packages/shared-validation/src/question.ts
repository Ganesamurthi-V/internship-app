/**
 * Question management schemas — the faculty side of the loop.
 *
 * A question defines both what is asked and how the answer is validated, so these
 * schemas police the *definition* while `submission.ts` applies the definition to
 * an actual answer.
 */

import { z } from 'zod';
import {
  ANSWER_MAX_LENGTH,
  ANSWER_MIN_LENGTH,
  MAX_QUESTION_OPTIONS,
  QUESTION_HELP_TEXT_MAX_LENGTH,
  QUESTION_OPTION_MAX_LENGTH,
  QUESTION_PROMPT_MAX_LENGTH,
  QUESTION_TYPES,
} from '@ims/shared-types';
import { sanitizeText } from './calculations';
import { booleanQuerySchema, optionalText, paginationQuerySchema, textField, uuidSchema } from './common';

/**
 * Choice options: trimmed, blank-stripped, de-duplicated case-insensitively.
 *
 * Duplicates matter here in a way they do not for free text — two identical
 * options render as two identical radio buttons, which is a broken form.
 */
const optionsSchema = z
  .array(z.string().transform(sanitizeText))
  .max(MAX_QUESTION_OPTIONS, {
    message: `Add ${MAX_QUESTION_OPTIONS} options or fewer.`,
  })
  .transform((options) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const option of options) {
      const value = option.slice(0, QUESTION_OPTION_MAX_LENGTH);
      if (value.length === 0) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  });

/** Length bounds an author may set. Kept inside the global answer bounds. */
const lengthBoundSchema = z.coerce
  .number()
  .int({ message: 'Length must be a whole number.' })
  .min(1, { message: 'Length must be at least 1.' })
  .max(ANSWER_MAX_LENGTH, {
    message: `Length cannot exceed ${ANSWER_MAX_LENGTH}.`,
  })
  .nullable()
  .optional();

const questionShape = {
  prompt: textField({ label: 'Question', min: 3, max: QUESTION_PROMPT_MAX_LENGTH }),
  helpText: optionalText('Help text', QUESTION_HELP_TEXT_MAX_LENGTH),
  type: z.enum(QUESTION_TYPES).default('long_text'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  required: z.boolean().default(true),
  options: optionsSchema.nullable().optional(),
  minLength: lengthBoundSchema,
  maxLength: lengthBoundSchema,
  departmentId: uuidSchema.nullable().optional(),
  referenceDocId: uuidSchema.nullable().optional(),
};

/**
 * Cross-field rules that cannot live on an individual field.
 *
 * Applied to create and update alike, which is why it is a standalone refinement
 * rather than inlined: an update that changes `type` to `choice` has to satisfy
 * the same option requirement as a create.
 */
function refineQuestion<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .superRefine((value: unknown, ctx: z.RefinementCtx) => {
      const q = value as {
        type?: string;
        options?: string[] | null;
        minLength?: number | null;
        maxLength?: number | null;
      };

      if (q.type === 'choice') {
        if (!q.options || q.options.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options'],
            message: 'A choice question needs at least two options.',
          });
        }
      } else if (q.options && q.options.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Only a choice question can have options.',
        });
      }

      if (
        q.minLength !== null &&
        q.minLength !== undefined &&
        q.maxLength !== null &&
        q.maxLength !== undefined &&
        q.minLength > q.maxLength
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['minLength'],
          message: 'Minimum length cannot exceed maximum length.',
        });
      }
    });
}

export const createQuestionSchema = refineQuestion(z.object(questionShape));
export type CreateQuestionInput = z.output<typeof createQuestionSchema>;

/**
 * Update is a partial: only the named fields change. `isActive` is update-only
 * because a question is always created active.
 */
export const updateQuestionSchema = refineQuestion(
  z
    .object({ ...questionShape, isActive: z.boolean() })
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update.',
    }),
);
export type UpdateQuestionInput = z.output<typeof updateQuestionSchema>;

export const questionListQuerySchema = paginationQuerySchema.extend({
  /** Defaults to active-only: the daily form never wants retired questions. */
  activeOnly: booleanQuerySchema.optional().default(true),
  departmentId: uuidSchema.optional(),
});
export type QuestionListQueryInput = z.output<typeof questionListQuerySchema>;

/** Bulk reorder, so dragging a list into place is one request not N. */
export const reorderQuestionsSchema = z.object({
  order: z
    .array(z.object({ id: uuidSchema, sortOrder: z.coerce.number().int().min(0).max(999) }))
    .min(1, { message: 'Provide at least one question.' })
    .max(100),
});
export type ReorderQuestionsInput = z.output<typeof reorderQuestionsSchema>;

/**
 * Builds the validator for one answer from its question definition.
 *
 * Defined here rather than in `submission.ts` because it is derived from the
 * question's own rules, and keeping it next to those rules is what stops the two
 * from drifting.
 */
export function answerValidatorFor(question: {
  type: string;
  required: boolean;
  options: string[] | null;
  minLength: number | null;
  maxLength: number | null;
}): z.ZodType<string> {
  const min = question.required ? (question.minLength ?? ANSWER_MIN_LENGTH) : 0;
  const max = question.maxLength ?? ANSWER_MAX_LENGTH;

  if (question.type === 'choice') {
    const options = question.options ?? [];
    return z
      .string()
      .transform(sanitizeText)
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          if (question.required) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select an option.' });
          }
          return;
        }
        if (!options.includes(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Select one of the offered options.',
          });
        }
      });
  }

  if (question.type === 'number') {
    return z
      .string()
      .transform((value) => value.trim())
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          if (question.required) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a number.' });
          }
          return;
        }
        if (!/^-?\d+(\.\d+)?$/u.test(value)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid number.' });
        }
      });
  }

  // text and long_text
  return z
    .string()
    .transform(sanitizeText)
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        if (question.required) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This answer is required.' });
        }
        return;
      }
      if (value.length < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Write at least ${min} characters. You have ${value.length}.`,
        });
      }
      if (value.length > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Keep it to ${max} characters or fewer. You have ${value.length}.`,
        });
      }
    });
}
