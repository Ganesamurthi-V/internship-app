/**
 * Retakes — reopening one closed day for one student.
 *
 * The submission window shuts at midnight (`SUBMISSION_BACKDATE_DAYS = 0`), and
 * attendance counts only approved days, so a day the student missed is absent with
 * no route back. That is deliberate for the default case and wrong for the real
 * ones: illness, a dead network, a family emergency. A retake grant is the exception
 * mechanism — narrow on purpose.
 *
 * WHAT A GRANT CANNOT DO
 *
 * It reopens exactly one date for exactly one student, and nothing else. It does not
 * relax the future-date rule, does not touch an approved day, does not let faculty
 * author answers, and does not survive its deadline. Each of those is enforced here
 * rather than left to the caller, because this is the only code path that can turn a
 * recorded absence into a recorded presence.
 *
 * WHY ROWS ARE NEVER DELETED
 *
 * Revoking sets `revokedAt`; using sets `usedAt`. Both keep the row. Months later
 * the question "why does this student have attendance for a day they missed" has to
 * be answerable, and a deleted row cannot answer it.
 *
 * This module deliberately does not import submissionService: that module imports
 * the grant lookup below, and the cycle would be real rather than cosmetic.
 */

import { Prisma } from '@prisma/client';
import type { MissedDay, RetakeInfo, SubmissionStatus } from '@ims/shared-types';
import {
  DEFAULT_WORKING_DAYS,
  RETAKE_DEFAULT_WINDOW_DAYS,
  RETAKE_MAX_WINDOW_DAYS,
} from '@ims/shared-types';
import { addDays, daysBetween, isWorkingDay } from '@ims/shared-validation';
import type {
  GrantRetakeInput,
  MissedDaysQueryInput,
  RetakeListQueryInput,
} from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { today, toDateColumn } from '@/lib/clock';
import { conflict, forbidden, notFound, validationError } from '@/lib/errors';
import { toDateOnly, toIso, toRequiredIso } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/context';
import {
  assertStudentAccess,
  canAccess,
  isStudent,
  resolveRelation,
  studentScopeFilter,
} from '@/lib/auth/guards';

// ---------------------------------------------------------------------------
// Selects and serialization
// ---------------------------------------------------------------------------

const retakeSelect = {
  id: true,
  studentId: true,
  targetDate: true,
  grantedAt: true,
  reason: true,
  expiresOn: true,
  usedAt: true,
  revokedAt: true,
  grantedBy: { select: { name: true, email: true } },
} satisfies Prisma.RetakeGrantSelect;

type RetakeRow = Prisma.RetakeGrantGetPayload<{ select: typeof retakeSelect }>;

/**
 * `isActive` is computed against the server's clock rather than stored, so a grant
 * cannot be "active" merely because no job has run to expire it.
 */
function serializeRetake(row: RetakeRow, currentDate: string): RetakeInfo {
  const expiresOn = toDateOnly(row.expiresOn);

  return {
    id: row.id,
    targetDate: toDateOnly(row.targetDate),
    // Falls back to the email so an account with no display name still attributes
    // the grant to somebody rather than reading "granted by nobody".
    grantedByName: row.grantedBy?.name ?? row.grantedBy?.email ?? null,
    grantedAt: toRequiredIso(row.grantedAt),
    reason: row.reason,
    expiresOn,
    usedAt: toIso(row.usedAt),
    revokedAt: toIso(row.revokedAt),
    isActive: row.revokedAt === null && expiresOn >= currentDate,
  };
}

// ---------------------------------------------------------------------------
// The lookup the submission path depends on
// ---------------------------------------------------------------------------

/**
 * The grant covering `date` for `studentId`, active or not.
 *
 * Returns revoked and expired grants too, with `isActive: false`. The student's form
 * needs them: "your retake for this day expired on the 9th" is an answer, whereas
 * dropping the row and falling back to the generic "this day has closed" leaves them
 * unable to tell a retake they never had from one they let lapse.
 *
 * `isActive` means granted, not revoked, and still inside its deadline. `usedAt` is
 * deliberately not part of that test: a retake that was submitted and then declined
 * has to stay fixable, and consuming the grant on first use would trap the student
 * with a declined answer they cannot replace. The deadline is what ends it.
 */
export async function getRetakeForDate(
  studentId: string,
  date: string,
  currentDate: string = today(),
): Promise<RetakeInfo | null> {
  const row = await prisma.retakeGrant.findUnique({
    where: { studentId_targetDate: { studentId, targetDate: toDateColumn(date) } },
    select: retakeSelect,
  });

  return row ? serializeRetake(row, currentDate) : null;
}

/**
 * Records that a submission was made under a grant.
 *
 * Only the first use is stamped: `usedAt` answers "when did the student act on
 * this", and overwriting it on every resubmission would lose that.
 */
export async function markRetakeUsed(
  retakeId: string,
  auth: AuthContext,
  metadata: Record<string, unknown>,
): Promise<void> {
  const result = await prisma.retakeGrant.updateMany({
    where: { id: retakeId, usedAt: null },
    data: { usedAt: new Date() },
  });

  // A resubmission under the same grant is not a new event worth an audit row.
  if (result.count === 0) return;

  await recordAudit({
    action: 'retake_used',
    entityType: 'retake_grant',
    entityId: retakeId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

/**
 * Reopens one closed day for one student.
 *
 * Re-granting the same day updates the existing row instead of failing. That is the
 * useful behaviour: a reviewer extending a deadline or correcting the reason is
 * doing the same thing as granting, and making them revoke first would leave a
 * revoked row and a fresh one describing one decision.
 */
export async function grantRetake(
  auth: AuthContext,
  input: GrantRetakeInput,
): Promise<RetakeInfo> {
  const currentDate = today();

  const student = await assertStudentAccess(auth, input.studentId, 'read');
  const relation = resolveRelation(auth, student);
  if (!canAccess(relation, 'retake', 'write')) {
    throw forbidden('Only faculty can grant a retake.');
  }

  // A day that has not closed yet needs no grant, and a future day cannot be
  // answered at all. Saying so is better than writing a row that does nothing.
  if (input.targetDate >= currentDate) {
    throw conflict(
      input.targetDate === currentDate
        ? 'Today is still open. A retake is only needed once the day has closed.'
        : 'You cannot grant a retake for a future date.',
      { targetDate: 'Pick a day that has already closed.' },
    );
  }

  const existingSubmission = await prisma.dailySubmission.findUnique({
    where: {
      studentId_submissionDate: {
        studentId: input.studentId,
        submissionDate: toDateColumn(input.targetDate),
      },
    },
    select: { status: true },
  });

  // An approved day is already counted present. Reopening it could only lower the
  // student's attendance, and it would make a settled record editable again.
  if (existingSubmission?.status === 'approved') {
    throw conflict('That day is already approved. There is nothing to retake.', {
      targetDate: 'This day already counts as present.',
    });
  }

  const expiresOn = input.expiresOn ?? addDays(currentDate, RETAKE_DEFAULT_WINDOW_DAYS);

  // The deadline is bounded from *today*, not from the target date, because that is
  // what decides how long the day stays writable.
  const windowDays = daysBetween(currentDate, expiresOn);
  if (windowDays < 0) {
    throw validationError('That deadline has already passed.', {
      expiresOn: 'Pick today or a later date.',
    });
  }
  if (windowDays > RETAKE_MAX_WINDOW_DAYS) {
    throw validationError(
      `A retake can stay open for at most ${RETAKE_MAX_WINDOW_DAYS} days.`,
      { expiresOn: `Pick a date within ${RETAKE_MAX_WINDOW_DAYS} days.` },
    );
  }

  const row = await prisma.retakeGrant.upsert({
    where: {
      studentId_targetDate: {
        studentId: input.studentId,
        targetDate: toDateColumn(input.targetDate),
      },
    },
    create: {
      studentId: input.studentId,
      targetDate: toDateColumn(input.targetDate),
      grantedById: auth.userId,
      reason: input.reason,
      expiresOn: toDateColumn(expiresOn),
    },
    update: {
      grantedById: auth.userId,
      grantedAt: new Date(),
      reason: input.reason,
      expiresOn: toDateColumn(expiresOn),
      // Re-granting a revoked day restores it rather than leaving a row that reads
      // active but tests as revoked.
      revokedAt: null,
    },
    select: retakeSelect,
  });

  await recordAudit({
    action: 'retake_granted',
    entityType: 'retake_grant',
    entityId: row.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      studentId: input.studentId,
      targetDate: input.targetDate,
      expiresOn,
      reason: input.reason,
      previousStatus: existingSubmission?.status ?? 'missing',
    },
  });

  return serializeRetake(row, currentDate);
}

// ---------------------------------------------------------------------------
// Revoking
// ---------------------------------------------------------------------------

/**
 * Withdraws a grant.
 *
 * A grant already used is still revocable: what it removes is the student's ability
 * to keep editing that day, not the submission they made. Any answers already
 * submitted stay in the review queue and are judged on their merits.
 */
export async function revokeRetake(auth: AuthContext, retakeId: string): Promise<RetakeInfo> {
  const currentDate = today();

  const existing = await prisma.retakeGrant.findUnique({
    where: { id: retakeId },
    select: {
      id: true,
      studentId: true,
      targetDate: true,
      revokedAt: true,
      student: { select: { id: true, departmentId: true } },
    },
  });

  if (!existing) throw notFound('That retake was not found.');

  const relation = resolveRelation(auth, existing.student);
  if (!canAccess(relation, 'retake', 'delete')) {
    throw forbidden('Only faculty can revoke a retake.');
  }

  if (existing.revokedAt !== null) {
    throw conflict('That retake has already been revoked.');
  }

  const row = await prisma.retakeGrant.update({
    where: { id: retakeId },
    data: { revokedAt: new Date() },
    select: retakeSelect,
  });

  await recordAudit({
    action: 'retake_revoked',
    entityType: 'retake_grant',
    entityId: retakeId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      studentId: existing.studentId,
      targetDate: toDateOnly(existing.targetDate),
    },
  });

  return serializeRetake(row, currentDate);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Grants the caller may see.
 *
 * A student is pinned to their own id regardless of what they asked for; the scope
 * filter is applied as a predicate rather than checked afterwards, so a student
 * passing someone else's `studentId` gets an empty list, not a 403 that confirms the
 * other student exists.
 */
export async function listRetakes(
  auth: AuthContext,
  query: RetakeListQueryInput,
): Promise<RetakeInfo[]> {
  const currentDate = today();
  const scope = studentScopeFilter(auth) as Prisma.StudentWhereInput;

  const rows = await prisma.retakeGrant.findMany({
    where: {
      student: {
        AND: [scope, ...(query.studentId ? [{ id: query.studentId }] : [])],
      },
      ...(query.includeInactive
        ? {}
        : { revokedAt: null, expiresOn: { gte: toDateColumn(currentDate) } }),
    },
    orderBy: [{ expiresOn: 'asc' }, { targetDate: 'desc' }],
    select: retakeSelect,
  });

  return rows.map((row) => serializeRetake(row, currentDate));
}

/** The active grants for one student, soonest deadline first. For the dashboard. */
export async function listActiveRetakesForStudent(
  studentId: string,
  currentDate: string = today(),
): Promise<RetakeInfo[]> {
  const rows = await prisma.retakeGrant.findMany({
    where: {
      studentId,
      revokedAt: null,
      expiresOn: { gte: toDateColumn(currentDate) },
    },
    orderBy: [{ expiresOn: 'asc' }, { targetDate: 'desc' }],
    select: retakeSelect,
  });

  return rows.map((row) => serializeRetake(row, currentDate));
}

// ---------------------------------------------------------------------------
// Candidate days
// ---------------------------------------------------------------------------

/**
 * The days a reviewer could reopen: every elapsed internship day not counted
 * present, newest first.
 *
 * Today is excluded — it is still open, so a grant for it would do nothing. Days
 * with a `pending` or `declined` submission are included alongside never-answered
 * ones, because both are absent under the attendance rule and both are fixed the
 * same way. A reviewer who sees only never-answered days would be left wondering
 * why a day they know was declined is missing from the list.
 *
 * The window matches the attendance denominator exactly (start date through today,
 * clipped at the end date, falling back to the first submission when no start date
 * was recorded). If it did not, faculty would be offered days the student was never
 * counted absent for.
 */
export async function listMissedDays(
  auth: AuthContext,
  studentId: string,
  query: MissedDaysQueryInput,
): Promise<MissedDay[]> {
  const currentDate = today();

  const student = await assertStudentAccess(auth, studentId, 'read');
  const relation = resolveRelation(auth, student);
  if (!canAccess(relation, 'retake', 'read')) {
    throw forbidden('You do not have permission to do that.');
  }

  const record = await prisma.student.findUnique({
    where: { id: studentId },
    select: { startDate: true, endDate: true, workingDays: true },
  });
  if (!record) throw notFound('Student not found.');

  // Falls back to the common working week rather than to "no days", which would make
  // the list empty and leave a reviewer unable to reopen anything.
  const workingDays =
    record.workingDays && record.workingDays.length > 0
      ? record.workingDays
      : [...DEFAULT_WORKING_DAYS];

  const [submissions, grants] = await Promise.all([
    prisma.dailySubmission.findMany({
      where: { studentId },
      orderBy: { submissionDate: 'asc' },
      select: { submissionDate: true, status: true },
    }),
    prisma.retakeGrant.findMany({
      where: { studentId },
      select: retakeSelect,
    }),
  ]);

  const statusByDate = new Map<string, SubmissionStatus>(
    submissions.map((row) => [toDateOnly(row.submissionDate), row.status as SubmissionStatus]),
  );
  const grantByDate = new Map<string, RetakeRow>(
    grants.map((row) => [toDateOnly(row.targetDate), row]),
  );

  const firstSubmission = submissions[0] ? toDateOnly(submissions[0].submissionDate) : null;
  const startDate = record.startDate ? toDateOnly(record.startDate) : firstSubmission;
  if (!startDate) return [];

  // Yesterday is the newest day that can have been missed.
  const yesterday = addDays(currentDate, -1);
  const endDate = record.endDate ? toDateOnly(record.endDate) : yesterday;
  const windowEnd = endDate < yesterday ? endDate : yesterday;

  if (windowEnd < startDate) return [];

  const days: MissedDay[] = [];

  // Walk backwards from the most recent day so the `limit` keeps the days a reviewer
  // is most likely to act on, rather than the oldest ones.
  for (let cursor = windowEnd; cursor >= startDate; cursor = addDays(cursor, -1)) {
    if (days.length >= query.limit) break;

    // A day outside the student's working week was never counted absent, so there is
    // nothing to reopen and offering it would invite a grant that changes no number.
    if (!isWorkingDay(cursor, workingDays)) continue;

    const status = statusByDate.get(cursor) ?? null;
    if (status === 'approved') continue;

    const grant = grantByDate.get(cursor);

    days.push({
      date: cursor,
      status: status ?? 'missing',
      retake: grant ? serializeRetake(grant, currentDate) : null,
    });
  }

  return days;
}

/** Whether the caller is the student the grant belongs to. Used by the routes. */
export function isOwnStudent(auth: AuthContext, studentId: string): boolean {
  return isStudent(auth) && auth.studentId === studentId;
}
