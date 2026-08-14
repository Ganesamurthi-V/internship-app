/**
 * Mentor evaluation — 01_PRD §4.7, 02_SRS §2.6.
 *
 * Ten rating parameters, all 1–5, plus free text and an employment recommendation.
 *
 * The governing rule is immutability: "Immutable after digital confirmation unless
 * faculty/admin reopens." `digital_confirmation` is the mentor's signature, and the
 * database backs this up with `mentor_evaluations_complete_when_confirmed`, a CHECK
 * constraint that makes a half-filled confirmed record unstorable.
 *
 * URL keying note: 05_API_Spec mixes `:internshipId` and `:id` across this group.
 * Everything here is keyed by **internship id**, because
 * `mentor_evaluations.internship_id` is UNIQUE (04_Database_Design §2) so it
 * identifies the row unambiguously, and the evaluation may not exist yet when the
 * mentor first opens the form.
 */

import type { MentorStudentItem } from '@ims/shared-types';
import { MENTOR_RATING_FIELDS } from '@ims/shared-types';
import type {
  SubmitMentorEvaluationInput,
  UpsertMentorEvaluationInput,
} from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { conflict, forbidden, notFound, validationError } from '@/lib/errors';
import { buildDiff, recordAudit } from '@/lib/audit';
import { serializeMentorEvaluation, toDateOnly } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { isStaff } from '@/lib/auth/guards';
import { getAttendanceSummaries } from '@/server/attendance/summaryService';

export const EVALUATION_SELECT = {
  id: true,
  internshipId: true,
  mentorId: true,
  technicalKnowledge: true,
  problemSolving: true,
  communication: true,
  teamwork: true,
  professionalBehaviour: true,
  punctualityAttendance: true,
  abilityToLearn: true,
  initiative: true,
  qualityOfWork: true,
  overallPerformance: true,
  strengths: true,
  improvementAreas: true,
  remarks: true,
  employmentRecommendation: true,
  digitalConfirmation: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Resolves the mentor responsible for an internship.
 *
 * An internship with no assigned mentor cannot be evaluated, which is a clearer
 * error than a foreign key failure.
 */
async function loadInternshipMentor(internshipId: string): Promise<{ mentorId: string }> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { mentorId: true },
  });
  if (!internship) throw notFound('Internship not found.');

  if (!internship.mentorId) {
    throw validationError('This internship has no industry mentor assigned.', {
      mentorId: 'Assign a mentor before requesting an evaluation.',
    });
  }

  return { mentorId: internship.mentorId };
}

/** A confirmed evaluation is closed to the mentor; only staff may reopen it. */
function assertEditable(
  auth: AuthContext,
  existing: { digitalConfirmation: boolean } | null,
): void {
  if (!existing?.digitalConfirmation) return;
  if (isStaff(auth)) return;

  throw forbidden(
    'This evaluation has been confirmed and can no longer be changed. Contact the institution if a correction is needed.',
  );
}

export async function getMentorEvaluation(internshipId: string) {
  return prisma.mentorEvaluation.findUnique({
    where: { internshipId },
    select: EVALUATION_SELECT,
  });
}

/** Saves a draft. Partial ratings are allowed until the mentor confirms. */
export async function upsertMentorEvaluation(
  auth: AuthContext,
  input: UpsertMentorEvaluationInput,
) {
  const { mentorId } = await loadInternshipMentor(input.internshipId);

  const existing = await prisma.mentorEvaluation.findUnique({
    where: { internshipId: input.internshipId },
    select: { id: true, digitalConfirmation: true },
  });
  assertEditable(auth, existing);

  const ratings = pickRatings(input);

  const data = {
    ...ratings,
    strengths: input.strengths ?? null,
    improvementAreas: input.improvementAreas ?? null,
    remarks: input.remarks ?? null,
    employmentRecommendation: input.employmentRecommendation ?? null,
  };

  return prisma.mentorEvaluation.upsert({
    where: { internshipId: input.internshipId },
    create: {
      internshipId: input.internshipId,
      // Derived from the internship, so a mentor cannot file an evaluation under
      // someone else's name (07_Security_and_Privacy §6).
      mentorId,
      ...data,
    },
    update: data,
    select: EVALUATION_SELECT,
  });
}

/**
 * Submits and locks the evaluation.
 *
 * `submitMentorEvaluationSchema` requires all ten ratings and
 * `digitalConfirmation: true`, so by the time this runs the record is complete. The
 * write sets `submitted_at` in the same statement, satisfying the CHECK constraint
 * that ties confirmation to completeness.
 */
export async function submitMentorEvaluation(
  auth: AuthContext,
  internshipId: string,
  input: SubmitMentorEvaluationInput,
) {
  const { mentorId } = await loadInternshipMentor(internshipId);

  const existing = await prisma.mentorEvaluation.findUnique({
    where: { internshipId },
    select: { id: true, digitalConfirmation: true },
  });

  if (existing?.digitalConfirmation) {
    throw conflict('This evaluation has already been confirmed.');
  }

  const ratings = pickRatings(input);

  const data = {
    ...ratings,
    strengths: input.strengths ?? null,
    improvementAreas: input.improvementAreas ?? null,
    remarks: input.remarks ?? null,
    employmentRecommendation: input.employmentRecommendation ?? null,
    digitalConfirmation: true,
    submittedAt: new Date(),
  };

  const evaluation = await prisma.mentorEvaluation.upsert({
    where: { internshipId },
    create: { internshipId, mentorId, ...data },
    update: data,
    select: EVALUATION_SELECT,
  });

  await recordAudit({
    action: 'mentor_evaluation_submitted',
    entityType: 'mentor_evaluation',
    entityId: evaluation.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      internshipId,
      overallPerformance: evaluation.overallPerformance,
      employmentRecommendation: evaluation.employmentRecommendation,
    },
    // High sensitivity per 07_Security_and_Privacy §9.
    strict: true,
  });

  return evaluation;
}

/**
 * Reopens a confirmed evaluation — faculty/admin only, per 02_SRS §2.6.
 *
 * Clears the confirmation and the submission timestamp together; leaving one set
 * would violate the completeness CHECK constraint.
 */
export async function reopenMentorEvaluation(
  auth: AuthContext,
  internshipId: string,
  reason: string | null,
) {
  const existing = await prisma.mentorEvaluation.findUnique({
    where: { internshipId },
    select: { ...EVALUATION_SELECT },
  });
  if (!existing) throw notFound('Mentor evaluation not found.');

  if (!existing.digitalConfirmation) {
    throw conflict('This evaluation has not been confirmed, so there is nothing to reopen.');
  }

  const evaluation = await prisma.mentorEvaluation.update({
    where: { internshipId },
    data: { digitalConfirmation: false, submittedAt: null },
    select: EVALUATION_SELECT,
  });

  await recordAudit({
    action: 'mentor_evaluation_edited',
    entityType: 'mentor_evaluation',
    entityId: evaluation.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { internshipId, mode: 'reopened', reason, changes: buildDiff(existing, evaluation) },
    strict: true,
  });

  return evaluation;
}

/**
 * Picks the ten rating fields off an input object.
 *
 * Driven by `MENTOR_RATING_FIELDS` rather than written out, so adding a parameter to
 * the shared constant cannot leave this function silently dropping it.
 */
function pickRatings(
  input: Partial<Record<(typeof MENTOR_RATING_FIELDS)[number], number | null | undefined>>,
): Record<(typeof MENTOR_RATING_FIELDS)[number], number | null> {
  const result = {} as Record<(typeof MENTOR_RATING_FIELDS)[number], number | null>;
  for (const field of MENTOR_RATING_FIELDS) {
    result[field] = input[field] ?? null;
  }
  return result;
}

/**
 * `GET /api/mentor/students` — the mentor's assigned students (05_API_Spec).
 *
 * Scoped strictly to `mentorId`, satisfying 09_Test_Plan §3: "Mentor cannot evaluate
 * a student not assigned to them." Contact details are not included — a mentor sees
 * only what they need to identify the student (07_Security_and_Privacy §8).
 */
export async function listMentorStudents(mentorId: string): Promise<MentorStudentItem[]> {
  const internships = await prisma.internship.findMany({
    where: { mentorId, status: { in: ['approved', 'active', 'completed'] } },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      student: { select: { name: true, registerNumber: true, programme: true } },
      mentorEvaluation: { select: EVALUATION_SELECT },
    },
  });

  const internshipIds = internships.map((internship) => internship.id);

  const [summaries, unverifiedCounts] = await Promise.all([
    getAttendanceSummaries(internshipIds),
    countUnverifiedAttendance(internshipIds),
  ]);

  return internships.map((internship) => ({
    internshipId: internship.id,
    studentName: internship.student.name,
    registerNumber: internship.student.registerNumber,
    programme: internship.student.programme,
    startDate: toDateOnly(internship.startDate),
    endDate: toDateOnly(internship.endDate),
    attendancePercentage: summaries.get(internship.id)?.attendancePercentage ?? null,
    unverifiedAttendanceCount: unverifiedCounts.get(internship.id) ?? 0,
    evaluation: internship.mentorEvaluation
      ? serializeMentorEvaluation(internship.mentorEvaluation)
      : null,
  }));
}

/** Attendance rows still awaiting mentor confirmation, per internship. */
async function countUnverifiedAttendance(
  internshipIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (internshipIds.length === 0) return result;

  const rows = await prisma.attendance.groupBy({
    by: ['internshipId'],
    where: {
      internshipId: { in: [...internshipIds] },
      mentorVerified: false,
      // Holidays and weekly offs are not something a mentor confirms.
      status: { in: ['present', 'absent', 'permission_leave'] },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    result.set(row.internshipId, row._count._all);
  }

  return result;
}
