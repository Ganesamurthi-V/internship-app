/**
 * Question management.
 *
 * Questions are soft-retired rather than deleted: past answers reference them, and
 * the history has to stay readable. `DELETE /api/questions/:id` therefore flips
 * `isActive` unless the question has never been answered, in which case a real
 * delete is safe and keeps the list tidy.
 */

import { Prisma } from '@prisma/client';
import type { Question, QuestionType } from '@ims/shared-types';
import { MAX_ACTIVE_QUESTIONS } from '@ims/shared-types';
import type { CreateQuestionInput, UpdateQuestionInput } from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/errors';
import { serializeQuestion } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/context';
import { isAdmin, questionScopeFilter } from '@/lib/auth/guards';

/** Everything the serializer and the answer validators need. */
const questionSelect = {
  id: true,
  prompt: true,
  helpText: true,
  type: true,
  sortOrder: true,
  isActive: true,
  required: true,
  options: true,
  minLength: true,
  maxLength: true,
  departmentId: true,
  referenceDocId: true,
  referenceDoc: {
    select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true, uploadedAt: true, submissionId: true },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuestionSelect;

/**
 * The questions that make up a day's form for a given department.
 *
 * Ordered by `sortOrder` then `createdAt`, so the form is stable between loads
 * even when two questions share a sort order.
 */
export async function listActiveQuestions(departmentId: string | null): Promise<Question[]> {
  const rows = await prisma.question.findMany({
    where: {
      isActive: true,
      OR: [{ departmentId: null }, ...(departmentId ? [{ departmentId }] : [])],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: MAX_ACTIVE_QUESTIONS,
    select: questionSelect,
  });

  return rows.map(serializeQuestion);
}

/** The management list, which can include retired questions. */
export async function listQuestions(
  auth: AuthContext,
  options: { activeOnly: boolean; departmentId?: string },
): Promise<Question[]> {
  const scope = questionScopeFilter(auth) as Prisma.QuestionWhereInput;

  const rows = await prisma.question.findMany({
    where: {
      AND: [
        scope,
        ...(options.activeOnly ? [{ isActive: true }] : []),
        ...(options.departmentId ? [{ departmentId: options.departmentId }] : []),
      ],
    },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: questionSelect,
  });

  return rows.map(serializeQuestion);
}

export async function getQuestion(questionId: string): Promise<Question> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: questionSelect,
  });

  if (!row) throw notFound('Question not found.');
  return serializeQuestion(row);
}

/**
 * Creates a question.
 *
 * The active-count ceiling is checked here rather than in the schema because it
 * depends on what is already stored. A form with 30 questions is not something a
 * student will finish, so the limit protects the loop the app exists for.
 */
export async function createQuestion(
  auth: AuthContext,
  input: CreateQuestionInput,
): Promise<Question> {
  // Faculty create questions for their own department; only an admin can create a
  // global one or target another department.
  const departmentId = isAdmin(auth) ? (input.departmentId ?? null) : (auth.departmentId ?? null);

  const activeCount = await prisma.question.count({
    where: {
      isActive: true,
      OR: [{ departmentId: null }, ...(departmentId ? [{ departmentId }] : [])],
    },
  });

  if (activeCount >= MAX_ACTIVE_QUESTIONS) {
    throw conflict(
      `There are already ${MAX_ACTIVE_QUESTIONS} active questions. Retire one before adding another.`,
    );
  }

  const created = await prisma.question.create({
    data: {
      prompt: input.prompt,
      helpText: input.helpText ?? null,
      type: input.type as QuestionType,
      sortOrder: input.sortOrder,
      required: input.required,
      options: toOptionsJson(input.type, input.options),
      minLength: input.minLength ?? null,
      maxLength: input.maxLength ?? null,
      departmentId,
      createdById: auth.userId,
      referenceDocId: (input as { referenceDocId?: string }).referenceDocId ?? null,
    },
    select: questionSelect,
  });

  await recordAudit({
    action: 'question_created',
    entityType: 'question',
    entityId: created.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { prompt: input.prompt, type: input.type, departmentId },
  });

  return serializeQuestion(created);
}

export async function updateQuestion(
  auth: AuthContext,
  questionId: string,
  input: UpdateQuestionInput,
): Promise<Question> {
  const existing = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, type: true, departmentId: true, isActive: true },
  });

  if (!existing) throw notFound('Question not found.');

  // Faculty may only touch questions in their own department. A global question is
  // institution-wide policy, so it is admin-only.
  if (!isAdmin(auth)) {
    if (existing.departmentId === null || existing.departmentId !== auth.departmentId) {
      throw conflict('Only an admin can change a question outside your department.');
    }
  }

  // Reactivating counts against the ceiling, so it needs the same check as create.
  if (input.isActive === true && !existing.isActive) {
    const activeCount = await prisma.question.count({
      where: {
        isActive: true,
        OR: [{ departmentId: null }, ...(existing.departmentId ? [{ departmentId: existing.departmentId }] : [])],
      },
    });
    if (activeCount >= MAX_ACTIVE_QUESTIONS) {
      throw conflict(`There are already ${MAX_ACTIVE_QUESTIONS} active questions.`);
    }
  }

  const nextType = (input.type ?? existing.type) as QuestionType;

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: {
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
      ...(input.type !== undefined ? { type: input.type as QuestionType } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.minLength !== undefined ? { minLength: input.minLength } : {}),
      ...(input.maxLength !== undefined ? { maxLength: input.maxLength } : {}),
      // Changing away from `choice` must clear the options, or a stale list is left
      // behind that the serializer would hide but the row would still carry.
      ...(input.options !== undefined || input.type !== undefined
        ? { options: toOptionsJson(nextType, input.options) }
        : {}),
      ...(isAdmin(auth) && input.departmentId !== undefined
        ? { departmentId: input.departmentId }
        : {}),
    },
    select: questionSelect,
  });

  await recordAudit({
    action: 'question_updated',
    entityType: 'question',
    entityId: questionId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { changed: Object.keys(input) },
  });

  return serializeQuestion(updated);
}

/**
 * Retires a question, or deletes it outright when nothing has answered it.
 *
 * Returns which happened so the caller can say so. A hard delete of an answered
 * question would cascade the answers away and quietly rewrite history.
 */
export async function retireQuestion(
  auth: AuthContext,
  questionId: string,
): Promise<{ deleted: boolean }> {
  const existing = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, departmentId: true, _count: { select: { answers: true } } },
  });

  if (!existing) throw notFound('Question not found.');

  if (!isAdmin(auth)) {
    if (existing.departmentId === null || existing.departmentId !== auth.departmentId) {
      throw conflict('Only an admin can remove a question outside your department.');
    }
  }

  if (existing._count.answers === 0) {
    await prisma.question.delete({ where: { id: questionId } });

    await recordAudit({
      action: 'question_deleted',
      entityType: 'question',
      entityId: questionId,
      actorUserId: auth.userId,
      context: auth.request,
      metadata: { hardDelete: true },
    });

    return { deleted: true };
  }

  await prisma.question.update({
    where: { id: questionId },
    data: { isActive: false },
  });

  await recordAudit({
    action: 'question_updated',
    entityType: 'question',
    entityId: questionId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { retired: true, answerCount: existing._count.answers },
  });

  return { deleted: false };
}

/** Applies a new display order in one transaction, so the list is never half-sorted. */
export async function reorderQuestions(
  auth: AuthContext,
  order: readonly { id: string; sortOrder: number }[],
): Promise<Question[]> {
  await prisma.$transaction(
    order.map((entry) =>
      prisma.question.update({
        where: { id: entry.id },
        data: { sortOrder: entry.sortOrder },
      }),
    ),
  );

  await recordAudit({
    action: 'questions_reordered',
    entityType: 'question',
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { count: order.length },
  });

  return listQuestions(auth, { activeOnly: false });
}

/**
 * Options are only stored for a choice question.
 *
 * Returning `Prisma.DbNull` rather than `undefined` matters: `undefined` means
 * "leave the column alone" in an update, which would preserve a stale option list
 * after the type changed.
 */
function toOptionsJson(
  type: string | undefined,
  options: string[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (type !== 'choice' || !options || options.length === 0) {
    return Prisma.DbNull;
  }
  return options;
}
