/**
 * Daily submission schemas — the student side of the loop, plus review.
 *
 * These validate the *shape* of a submission. The per-answer content rules come
 * from each question's own definition and are applied with
 * `validateAnswersAgainstQuestions`, because the server is the only place that
 * knows which questions were actually offered.
 */

import { z } from 'zod';
import {
  ANSWER_HARD_MAX_LENGTH,
  MAX_ACTIVE_QUESTIONS,
  MAX_FILES_PER_SUBMISSION,
  REVIEW_DECISIONS,
  REVIEW_NOTE_MAX_LENGTH,
  REVIEW_NOTE_MIN_LENGTH,
  SUBMISSION_STATUSES,
} from '@ims/shared-types';
import { sanitizeText } from './calculations';
import { answerValidatorFor } from './question';
import {
  booleanQuerySchema,
  dateOnlySchema,
  paginationQuerySchema,
  textField,
  uuidSchema,
} from './common';

// ---------------------------------------------------------------------------
// Submitting answers
// ---------------------------------------------------------------------------

export const answerInputSchema = z.object({
  questionId: uuidSchema,
  /**
   * Bounded generously here; the real per-question rule is applied server-side
   * once we know which question this is. This bound exists only to stop an
   * absurd payload before any work is done.
   *
   * Uses the hard ceiling rather than a multiple of the character bound, because the
   * real limit on a text answer is a word count: rejecting on characters here would
   * refuse an answer inside its word limit before the word rule ever ran.
   */
  answerText: z.string().max(ANSWER_HARD_MAX_LENGTH, { message: 'Answer is too long.' }),
});
export type AnswerInputParsed = z.output<typeof answerInputSchema>;

export const submitAnswersSchema = z.object({
  /** Omitted means today. The server decides what today is, not the device. */
  date: dateOnlySchema.optional(),

  answers: z
    .array(answerInputSchema)
    .min(1, { message: 'Answer at least one question.' })
    .max(MAX_ACTIVE_QUESTIONS, { message: 'Too many answers.' })
    // A duplicated questionId would make the upsert ambiguous.
    .superRefine((answers, ctx) => {
      const seen = new Set<string>();
      for (const answer of answers) {
        if (seen.has(answer.questionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'The same question was answered twice.',
          });
          return;
        }
        seen.add(answer.questionId);
      }
    }),

  documentIds: z
    .array(uuidSchema)
    .max(MAX_FILES_PER_SUBMISSION, {
      message: `Attach ${MAX_FILES_PER_SUBMISSION} files or fewer.`,
    })
    .optional()
    .default([]),
});
export type SubmitAnswersInput = z.output<typeof submitAnswersSchema>;

/** One question as the answer validator needs it. */
export interface QuestionRule {
  id: string;
  prompt: string;
  type: string;
  required: boolean;
  options: string[] | null;
  minLength: number | null;
  maxLength: number | null;
}

export interface ValidatedAnswer {
  questionId: string;
  promptSnapshot: string;
  answerText: string;
}

export type AnswerValidationResult =
  | { ok: true; answers: ValidatedAnswer[] }
  | { ok: false; fields: Record<string, string> };

/**
 * Applies each question's own rules to the submitted answers.
 *
 * Returns field-keyed messages rather than throwing, so a route can hand them
 * straight back as a 422 and the form can render them inline against the right
 * question. Keys are the question ids.
 *
 * Three checks, in order of what the student most needs to know:
 *  1. answers for questions that were not offered — a client bug, rejected
 *  2. missing required answers
 *  3. per-answer content rules from the question definition
 *
 * The prompt is snapshotted onto each answer here so later edits to a question
 * cannot rewrite what a past submission appears to have been asked.
 */
export function validateAnswersAgainstQuestions(
  questions: readonly QuestionRule[],
  answers: readonly { questionId: string; answerText: string }[],
): AnswerValidationResult {
  const fields: Record<string, string> = {};
  const byId = new Map(questions.map((question) => [question.id, question]));

  for (const answer of answers) {
    if (!byId.has(answer.questionId)) {
      fields[answer.questionId] = 'This question is not part of today\u2019s form.';
    }
  }

  const provided = new Map(
    answers.map((answer) => [answer.questionId, sanitizeText(answer.answerText)]),
  );

  const validated: ValidatedAnswer[] = [];

  for (const question of questions) {
    const raw = provided.get(question.id);

    if (raw === undefined || raw.length === 0) {
      if (question.required) {
        fields[question.id] = 'This answer is required.';
      }
      // Optional and unanswered: no row is written.
      continue;
    }

    const result = answerValidatorFor(question).safeParse(raw);

    if (!result.success) {
      fields[question.id] = result.error.issues[0]?.message ?? 'This answer is not valid.';
      continue;
    }

    validated.push({
      questionId: question.id,
      promptSnapshot: question.prompt,
      answerText: result.data,
    });
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, answers: validated };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * A reviewer's decision.
 *
 * The note is conditionally required: declining without a reason leaves the
 * student with nothing to act on, so the refinement enforces it rather than
 * leaving it to the reviewer's goodwill.
 */
export const reviewSubmissionSchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    note: textField({ label: 'Note', max: REVIEW_NOTE_MAX_LENGTH })
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .optional(),

    /**
     * Whether to reopen the day so the student can answer it again.
     *
     * Part of the decline decision rather than a separate step, because declining a day
     * that has already closed otherwise leaves the student holding a permanent absence
     * with no way to act on the feedback they were just given. The reviewer is the only
     * one who knows whether the answer was fixable or simply wrong.
     *
     * The decline note becomes the retake's reason: one explanation covers both, and
     * asking for a second one would just get the same words twice.
     */
    grantRetake: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== 'declined') {
      // Approval already counts the day present, so there is nothing to retake. Refused
      // rather than ignored: silently dropping it would let a caller believe a retake was
      // granted when none was.
      if (value.grantRetake) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['grantRetake'],
          message: 'A retake can only be granted when declining.',
        });
      }
      return;
    }

    const note = value.note ?? '';
    if (note.length < REVIEW_NOTE_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: `Say why it was declined, in at least ${REVIEW_NOTE_MIN_LENGTH} characters.`,
      });
    }
  });
export type ReviewSubmissionInput = z.output<typeof reviewSubmissionSchema>;

/** Approve or decline several submissions at once from the review list. */
export const bulkReviewSchema = z
  .object({
    submissionIds: z
      .array(uuidSchema)
      .min(1, { message: 'Select at least one submission.' })
      .max(100, { message: 'Select 100 or fewer at a time.' }),
    decision: z.enum(REVIEW_DECISIONS),
    note: textField({ label: 'Note', max: REVIEW_NOTE_MAX_LENGTH })
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== 'declined') return;
    if ((value.note ?? '').length < REVIEW_NOTE_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: `Say why these were declined, in at least ${REVIEW_NOTE_MIN_LENGTH} characters.`,
      });
    }
  });
export type BulkReviewInput = z.output<typeof bulkReviewSchema>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const submissionListQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(SUBMISSION_STATUSES).optional(),
    studentId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The "from" date must be on or before the "to" date.',
    path: ['from'],
  });
export type SubmissionListQueryInput = z.output<typeof submissionListQuerySchema>;

export const todayQuerySchema = z.object({
  /** Lets a student review a past day. Defaults to today. */
  date: dateOnlySchema.optional(),
});
export type TodayQueryInput = z.output<typeof todayQuerySchema>;

export const studentListQuerySchema = paginationQuerySchema.extend({
  departmentId: uuidSchema.optional(),
  year: z.coerce.number().int().min(1).max(5).optional(),
  section: z.string().trim().max(10).optional(),
  search: z.string().trim().max(100).optional(),
  submittedToday: booleanQuerySchema.optional(),
});
export type StudentListQueryInput = z.output<typeof studentListQuerySchema>;
