/**
 * Daily submissions — the core loop.
 *
 * A submission is both the answer set and the attendance record: the day counts as
 * attended once a reviewer approves it. There is no separate attendance table, so
 * the two can never disagree.
 *
 * The write path is a single transaction that replaces the answer set wholesale
 * rather than diffing it. A partially updated answer set would be worse than either
 * outcome — the student would not know which version was recorded.
 */

import { Prisma } from '@prisma/client';
import type {
  AttendanceSummary,
  DailySubmission,
  DailySubmissionDetail,
  Pagination,
  TodayForm,
} from '@ims/shared-types';
import {
  ALLOW_EDIT_WHILE_PENDING,
  DEFAULT_WORKING_DAYS,
  SUBMISSION_BACKDATE_DAYS,
} from '@ims/shared-types';
import {
  summariseSubmissions,
  submissionLockReason,
  validateAnswersAgainstQuestions,
  type QuestionRule,
  type SubmitAnswersInput,
  type ReviewSubmissionInput,
  type SubmissionListQueryInput,
} from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn, fromDateColumn, dateRangeFilter } from '@/lib/clock';
import { conflict, forbidden, notFound, validationError } from '@/lib/errors';
import { serializeSubmission, serializeSubmissionDetail } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/context';
import { isReviewer, submissionScopeFilter } from '@/lib/auth/guards';
import { listActiveQuestions } from '@/server/questions/questionService';
import { getRetakeForDate, markRetakeUsed } from '@/server/retakes/retakeService';

/**
 * Guards the derivation of document ids from file answers. A `file_upload` answer
 * should always hold a uuid, but an older or hand-written row might hold prose, and
 * feeding that to a uuid column throws at the database instead of being ignored.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const submissionSelect = {
  id: true,
  studentId: true,
  submissionDate: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DailySubmissionSelect;

const submissionDetailSelect = {
  ...submissionSelect,
  answers: {
    select: {
      id: true,
      questionId: true,
      promptSnapshot: true,
      answerText: true,
      // Needed so the serializer can tell a file answer from prose and resolve the
      // referenced document; otherwise a file answer renders as a bare UUID.
      question: { select: { type: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  documents: {
    where: { deletedAt: null },
    select: {
      id: true,
      submissionId: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: 'asc' },
  },
  reviewedBy: { select: { name: true, email: true } },
} satisfies Prisma.DailySubmissionSelect;

/** Detail plus the student summary, for the reviewer-facing views. */
const submissionReviewSelect = {
  ...submissionDetailSelect,
  student: {
    select: {
      id: true,
      registerNumber: true,
      name: true,
      programme: true,
      year: true,
      section: true,
      department: { select: { name: true } },
    },
  },
} satisfies Prisma.DailySubmissionSelect;

// ---------------------------------------------------------------------------
// Today's form
// ---------------------------------------------------------------------------

/**
 * Everything the student's daily screen needs in one call: the questions, the
 * existing submission if any, and whether the form still accepts a write.
 *
 * The lock reason is computed server-side because the server owns what "today" is.
 * A device with a wrong clock must not be able to reopen a closed day.
 */
export async function getTodayForm(
  auth: AuthContext,
  studentId: string,
  requestedDate?: string,
): Promise<TodayForm> {
  const currentDate = today();
  const date = requestedDate ?? currentDate;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, departmentId: true },
  });
  if (!student) throw notFound('Student profile not found.');

  const [questions, existing, retake] = await Promise.all([
    listActiveQuestions(student.departmentId),
    prisma.dailySubmission.findUnique({
      where: { studentId_submissionDate: { studentId, submissionDate: toDateColumn(date) } },
      select: submissionDetailSelect,
    }),
    getRetakeForDate(studentId, date, currentDate),
  ]);

  const lockedReason = submissionLockReason({
    date,
    today: currentDate,
    backdateDays: SUBMISSION_BACKDATE_DAYS,
    existingStatus: existing ? (existing.status as DailySubmission['status']) : null,
    allowEditWhilePending: ALLOW_EDIT_WHILE_PENDING,
    // A faculty grant is the only thing that reopens a closed day.
    retakeOpen: retake?.isActive ?? false,
  });

  return {
    date,
    questions,
    submission: existing ? serializeSubmissionDetail(existing) : null,
    canSubmit: lockedReason === null && questions.length > 0,
    lockedReason:
      lockedReason ??
      (questions.length === 0 ? 'No questions have been set up yet. Check back later.' : null),
    retake,
  };
}

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

/**
 * Creates or replaces a day's submission.
 *
 * Re-submitting is allowed while pending or after a decline, and resets the status
 * to `pending` along with clearing the previous review. That reset is deliberate: a
 * declined submission that has been fixed must go back into the queue, not stay
 * marked declined with new content.
 */
export async function submitAnswers(
  auth: AuthContext,
  studentId: string,
  input: SubmitAnswersInput,
): Promise<DailySubmissionDetail> {
  const currentDate = today();
  const date = input.date ?? currentDate;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, departmentId: true },
  });
  if (!student) throw notFound('Student profile not found.');

  const dateColumn = toDateColumn(date);

  const [existing, retake] = await Promise.all([
    prisma.dailySubmission.findUnique({
      where: { studentId_submissionDate: { studentId, submissionDate: dateColumn } },
      select: { id: true, status: true },
    }),
    getRetakeForDate(studentId, date, currentDate),
  ]);

  const lockedReason = submissionLockReason({
    date,
    today: currentDate,
    backdateDays: SUBMISSION_BACKDATE_DAYS,
    existingStatus: existing ? (existing.status as DailySubmission['status']) : null,
    allowEditWhilePending: ALLOW_EDIT_WHILE_PENDING,
    // Re-checked here rather than trusted from the form: the grant could have been
    // revoked, or expired at midnight, between loading the form and submitting it.
    retakeOpen: retake?.isActive ?? false,
  });

  if (lockedReason) throw conflict(lockedReason);

  const questions = await prisma.question.findMany({
    where: {
      isActive: true,
      OR: [{ departmentId: null }, ...(student.departmentId ? [{ departmentId: student.departmentId }] : [])],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      prompt: true,
      type: true,
      required: true,
      options: true,
      minLength: true,
      maxLength: true,
    },
  });

  if (questions.length === 0) {
    throw conflict('No questions have been set up yet.');
  }

  const rules: QuestionRule[] = questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    required: question.required,
    options: Array.isArray(question.options)
      ? (question.options as unknown[]).filter((o): o is string => typeof o === 'string')
      : null,
    minLength: question.minLength,
    maxLength: question.maxLength,
  }));

  const validation = validateAnswersAgainstQuestions(rules, input.answers);
  if (!validation.ok) {
    throw validationError('Some answers need attention.', validation.fields);
  }

  // A `file_upload` answer stores its document id as the answer text, so those
  // documents must be attached too. Deriving them here rather than trusting the
  // client to also list them in `documentIds` is what stops a file answer from
  // pointing at a document that was never linked to the submission — which left
  // reviewers looking at a bare UUID with no file behind it.
  const fileQuestionIds = new Set(
    questions.filter((question) => question.type === 'file_upload').map((question) => question.id),
  );

  const answerDocumentIds = validation.answers
    .filter((answer) => fileQuestionIds.has(answer.questionId))
    .map((answer) => answer.answerText.trim())
    .filter((value) => UUID_PATTERN.test(value));

  const documentIds = [...new Set([...(input.documentIds ?? []), ...answerDocumentIds])];

  // Only files the caller uploaded and has not already attached elsewhere.
  if (documentIds.length > 0) {
    const owned = await prisma.document.count({
      where: {
        id: { in: documentIds },
        ownerUserId: auth.userId,
        deletedAt: null,
        OR: [{ submissionId: null }, ...(existing ? [{ submissionId: existing.id }] : [])],
      },
    });
    if (owned !== documentIds.length) {
      throw validationError('One of the attached files is not available.', {
        documentIds: 'Upload the files again.',
      });
    }
  }

  const submission = await prisma.$transaction(async (tx) => {
    const record = await tx.dailySubmission.upsert({
      where: { studentId_submissionDate: { studentId, submissionDate: dateColumn } },
      create: {
        studentId,
        submissionDate: dateColumn,
        status: 'pending',
      },
      update: {
        // A resubmission goes back into the queue with the old decision cleared.
        status: 'pending',
        submittedAt: new Date(),
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
      select: { id: true },
    });

    // Replace the answer set wholesale. A diff could leave the student unsure
    // which version was recorded if it failed halfway.
    await tx.answer.deleteMany({ where: { submissionId: record.id } });
    await tx.answer.createMany({
      data: validation.answers.map((answer) => ({
        submissionId: record.id,
        questionId: answer.questionId,
        promptSnapshot: answer.promptSnapshot,
        answerText: answer.answerText,
      })),
    });

    // Release files that were attached before but are no longer referenced, so
    // replacing a file on a resubmission does not leave the old one hanging off the
    // submission and visible to the reviewer as a stale attachment.
    await tx.document.updateMany({
      where: {
        submissionId: record.id,
        ownerUserId: auth.userId,
        ...(documentIds.length > 0 ? { id: { notIn: documentIds } } : {}),
      },
      data: { submissionId: null },
    });

    if (documentIds.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: documentIds }, ownerUserId: auth.userId },
        data: { submissionId: record.id },
      });
    }

    return tx.dailySubmission.findUniqueOrThrow({
      where: { id: record.id },
      select: submissionDetailSelect,
    });
  });

  await recordAudit({
    action: existing ? 'submission_updated' : 'submission_created',
    entityType: 'daily_submission',
    entityId: submission.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      date,
      answerCount: validation.answers.length,
      documentCount: documentIds.length,
      resubmitted: Boolean(existing),
      // Marks this row as one that only exists because a closed day was reopened.
      viaRetake: retake?.isActive ?? false,
    },
  });

  // Stamped after the write, not before: a grant recorded as used against a
  // submission that failed to save would read as a spent second chance.
  if (retake?.isActive) {
    await markRetakeUsed(retake.id, auth, {
      submissionId: submission.id,
      date,
      resubmitted: Boolean(existing),
    });
  }

  return serializeSubmissionDetail(submission);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getSubmissionDetail(
  auth: AuthContext,
  submissionId: string,
): Promise<DailySubmissionDetail> {
  // Reviewers get the student summary alongside; a student does not need a copy of
  // their own.
  const row = await prisma.dailySubmission.findUnique({
    where: { id: submissionId },
    select: isReviewer(auth) ? submissionReviewSelect : submissionDetailSelect,
  });

  if (!row) throw notFound('Submission not found.');
  return serializeSubmissionDetail(row);
}

export async function listSubmissions(
  auth: AuthContext,
  query: SubmissionListQueryInput,
): Promise<{ data: DailySubmissionDetail[]; pagination: Pagination }> {
  const scope = submissionScopeFilter(auth) as Prisma.DailySubmissionWhereInput;
  const dateFilter = dateRangeFilter(query.from, query.to);

  const where: Prisma.DailySubmissionWhereInput = {
    AND: [
      scope,
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.studentId ? [{ studentId: query.studentId }] : []),
      ...(query.departmentId ? [{ student: { departmentId: query.departmentId } }] : []),
      ...(dateFilter ? [{ submissionDate: dateFilter }] : []),
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.dailySubmission.count({ where }),
    prisma.dailySubmission.findMany({
      where,
      // Oldest pending first is the order a reviewer works through a queue.
      orderBy: [{ submissionDate: 'desc' }, { submittedAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: isReviewer(auth) ? submissionReviewSelect : submissionDetailSelect,
    }),
  ]);

  return {
    data: rows.map(serializeSubmissionDetail),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 0,
    },
  };
}

/** A student's own history, newest first, without the answer bodies. */
export async function listSubmissionHistory(
  studentId: string,
  limit = 60,
): Promise<DailySubmission[]> {
  const rows = await prisma.dailySubmission.findMany({
    where: { studentId },
    orderBy: { submissionDate: 'desc' },
    take: limit,
    select: submissionSelect,
  });

  return rows.map(serializeSubmission);
}

/**
 * A stored working week, or the default when the column holds nothing usable.
 *
 * An empty array would make the attendance denominator zero and the percentage
 * unmeasurable for that student. The column is defaulted and validated on write, so
 * this should never fire — but degrading to the common working week is a far better
 * failure than a student whose attendance silently cannot be computed.
 */
function resolveWorkingDays(stored: number[] | null | undefined): number[] {
  if (!stored || stored.length === 0) return [...DEFAULT_WORKING_DAYS];
  return stored;
}

/**
 * The derived attendance figures for one student.
 *
 * Three things are loaded alongside the submissions, because none of them can be
 * inferred from a submission list:
 *
 *   - the internship dates, which give the denominator its length,
 *   - the working days, without which a student is marked absent for Sundays,
 *   - the open retake grants, so the summary can report how many absent days are
 *     still recoverable.
 */
export async function getAttendanceSummary(studentId: string): Promise<AttendanceSummary> {
  const currentDate = today();

  const [student, rows, retakes] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { startDate: true, endDate: true, workingDays: true },
    }),
    prisma.dailySubmission.findMany({
      where: { studentId },
      select: { submissionDate: true, status: true },
    }),
    prisma.retakeGrant.findMany({
      where: {
        studentId,
        revokedAt: null,
        expiresOn: { gte: toDateColumn(currentDate) },
      },
      select: { targetDate: true },
    }),
  ]);

  return summariseSubmissions(
    rows.map((row) => ({
      submissionDate: fromDateColumn(row.submissionDate),
      status: row.status as DailySubmission['status'],
    })),
    {
      startDate: student?.startDate ? fromDateColumn(student.startDate) : null,
      endDate: student?.endDate ? fromDateColumn(student.endDate) : null,
      today: currentDate,
      workingDays: resolveWorkingDays(student?.workingDays),
      retakeOpenDates: retakes.map((row) => fromDateColumn(row.targetDate)),
    },
  );
}

/** Batched summaries, so the faculty student list is one query not N. */
export async function getAttendanceSummaries(
  studentIds: readonly string[],
): Promise<Map<string, AttendanceSummary>> {
  const result = new Map<string, AttendanceSummary>();
  if (studentIds.length === 0) return result;

  const ids = [...studentIds];
  const currentDate = today();

  // Three batched queries rather than three per student: the internship windows, the
  // submissions and the open retakes, then joined in memory.
  const [students, rows, retakes] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, startDate: true, endDate: true, workingDays: true },
    }),
    prisma.dailySubmission.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, submissionDate: true, status: true },
    }),
    prisma.retakeGrant.findMany({
      where: {
        studentId: { in: ids },
        revokedAt: null,
        expiresOn: { gte: toDateColumn(currentDate) },
      },
      select: { studentId: true, targetDate: true },
    }),
  ]);

  const retakesByStudent = new Map<string, string[]>();
  for (const row of retakes) {
    const list = retakesByStudent.get(row.studentId) ?? [];
    list.push(fromDateColumn(row.targetDate));
    retakesByStudent.set(row.studentId, list);
  }

  const windowByStudent = new Map(
    students.map((student) => [
      student.id,
      {
        startDate: student.startDate ? fromDateColumn(student.startDate) : null,
        endDate: student.endDate ? fromDateColumn(student.endDate) : null,
        today: currentDate,
        workingDays: resolveWorkingDays(student.workingDays),
        retakeOpenDates: retakesByStudent.get(student.id) ?? [],
      },
    ]),
  );

  const grouped = new Map<string, { submissionDate: string; status: DailySubmission['status'] }[]>();
  for (const row of rows) {
    const list = grouped.get(row.studentId) ?? [];
    list.push({
      submissionDate: fromDateColumn(row.submissionDate),
      status: row.status as DailySubmission['status'],
    });
    grouped.set(row.studentId, list);
  }

  for (const studentId of ids) {
    result.set(
      studentId,
      summariseSubmissions(grouped.get(studentId) ?? [], windowByStudent.get(studentId)),
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * Approves or declines a submission.
 *
 * Only a `pending` submission can be decided. Re-deciding an already-reviewed one
 * is rejected rather than silently overwritten, because a second decision without
 * an audit trail of the first is how disputes become unresolvable.
 */
export async function reviewSubmission(
  auth: AuthContext,
  submissionId: string,
  input: ReviewSubmissionInput,
): Promise<DailySubmissionDetail> {
  const existing = await prisma.dailySubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true, studentId: true, submissionDate: true },
  });

  if (!existing) throw notFound('Submission not found.');

  if (existing.status !== 'pending') {
    throw conflict(
      existing.status === 'approved'
        ? 'This submission has already been approved.'
        : 'This submission has already been declined.',
    );
  }

  const updated = await prisma.dailySubmission.update({
    where: { id: submissionId },
    data: {
      status: input.decision,
      reviewedById: auth.userId,
      reviewedAt: new Date(),
      reviewNote: input.note ?? null,
    },
    select: submissionReviewSelect,
  });

  await recordAudit({
    action: input.decision === 'approved' ? 'submission_approved' : 'submission_declined',
    entityType: 'daily_submission',
    entityId: submissionId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      studentId: existing.studentId,
      date: existing.submissionDate.toISOString().slice(0, 10),
      ...(input.note ? { note: input.note } : {}),
    },
  });

  return serializeSubmissionDetail(updated);
}

/**
 * Reviews several submissions at once.
 *
 * Scoped and filtered to `pending` in the same query that updates, so a bulk action
 * cannot reach outside the caller's department or re-decide something already
 * decided. Returns the count actually changed rather than the count requested.
 */
export async function bulkReview(
  auth: AuthContext,
  submissionIds: readonly string[],
  decision: 'approved' | 'declined',
  note: string | null,
): Promise<{ updated: number }> {
  const scope = submissionScopeFilter(auth) as Prisma.DailySubmissionWhereInput;

  const result = await prisma.dailySubmission.updateMany({
    where: {
      AND: [scope, { id: { in: [...submissionIds] } }, { status: 'pending' }],
    },
    data: {
      status: decision,
      reviewedById: auth.userId,
      reviewedAt: new Date(),
      reviewNote: note,
    },
  });

  await recordAudit({
    action: decision === 'approved' ? 'submission_approved' : 'submission_declined',
    entityType: 'daily_submission',
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { bulk: true, requested: submissionIds.length, updated: result.count },
  });

  return { updated: result.count };
}

/** Admin-only hard delete, for cleaning up test or duplicate data. */
export async function deleteSubmission(auth: AuthContext, submissionId: string): Promise<void> {
  const existing = await prisma.dailySubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, studentId: true },
  });

  if (!existing) throw notFound('Submission not found.');
  if (auth.role !== 'admin') throw forbidden('Only an admin can delete a submission.');

  // Answers and documents cascade from the schema.
  await prisma.dailySubmission.delete({ where: { id: submissionId } });

  await recordAudit({
    action: 'submission_deleted',
    entityType: 'daily_submission',
    entityId: submissionId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { studentId: existing.studentId },
    strict: true,
  });
}
