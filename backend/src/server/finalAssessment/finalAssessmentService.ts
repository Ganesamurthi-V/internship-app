/**
 * Final assessment and skill self-ratings — 01_PRD §4.5/§4.6, 02_SRS §2.5.
 *
 * Three rules drive this module:
 *
 *  1. Unlock (02_SRS §2.5): "Unlocked when internship end date is reached OR faculty
 *     manually enables early access." Both conditions are checked server-side, so a
 *     client cannot open the form early by ignoring the flag.
 *
 *  2. Immutability: "Cannot be re-submitted after final submission unless
 *     faculty/admin reopens." `submitted_at` is the lock; reopening clears it and is
 *     audited as a High-sensitivity event (07_Security_and_Privacy §9).
 *
 *  3. Auto-filled totals (01_PRD §4.5): days attended and hours come from attendance
 *     aggregation, not from the student. They are recomputed at submit time so the
 *     stored evidence matches the attendance record exactly.
 */

import type { FinalAssessmentAccess, FinalAssessmentDetail } from '@ims/shared-types';
import { SKILL_TYPES } from '@ims/shared-types';
import type {
  SubmitFinalAssessmentInput,
  UpsertFinalAssessmentInput,
} from '@ims/shared-validation';
import { isFinalAssessmentUnlocked } from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { today } from '@/lib/clock';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { NOTIFICATIONS, sendNotification } from '@/lib/push';
import { serializeFinalAssessment, toDateOnly } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { isStaff } from '@/lib/auth/guards';
import { getAttendanceSummary } from '@/server/attendance/summaryService';
import { getFinalChecklist } from '@/server/documents/checklistService';

export const FINAL_ASSESSMENT_SELECT = {
  id: true,
  internshipId: true,
  studentId: true,
  completedSuccessfully: true,
  totalDaysAttended: true,
  totalHours: true,
  majorProject: true,
  technologiesMastered: true,
  skillsDeveloped: true,
  objectivesStatus: true,
  usefulnessRating: true,
  technicalImprovement: true,
  employabilityImprovement: true,
  curriculumRelation: true,
  realWorldExposure: true,
  recommendOrganisation: true,
  suggestions: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  skillRatings: {
    select: { id: true, finalAssessmentId: true, skillType: true, rating: true },
    orderBy: { skillType: 'asc' },
  },
} as const;

interface AssessmentContext {
  internshipId: string;
  studentId: string;
  endDate: string;
  status: string;
  facultyUnlockedAt: Date | null;
  submittedAt: Date | null;
  assessmentId: string | null;
}

async function loadContext(internshipId: string): Promise<AssessmentContext> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: {
      id: true,
      studentId: true,
      endDate: true,
      status: true,
      finalAssessment: {
        select: { id: true, submittedAt: true, facultyUnlockedAt: true },
      },
    },
  });
  if (!internship) throw notFound('Internship not found.');

  return {
    internshipId: internship.id,
    studentId: internship.studentId,
    endDate: toDateOnly(internship.endDate),
    status: internship.status,
    facultyUnlockedAt: internship.finalAssessment?.facultyUnlockedAt ?? null,
    submittedAt: internship.finalAssessment?.submittedAt ?? null,
    assessmentId: internship.finalAssessment?.id ?? null,
  };
}

function resolveAccess(context: AssessmentContext): FinalAssessmentAccess {
  const currentDate = today();
  const endDateReached = currentDate >= context.endDate;
  const facultyUnlocked = context.facultyUnlockedAt !== null;

  return {
    unlocked: isFinalAssessmentUnlocked({
      endDate: context.endDate,
      today: currentDate,
      facultyUnlocked,
    }),
    endDateReached,
    facultyUnlocked,
    submittedAt: context.submittedAt?.toISOString() ?? null,
  };
}

/**
 * Read model for the three-part form (06_App_Flow §6).
 *
 * Returns the access state alongside the record so the app can render a locked view
 * without a second round trip, and the auto-filled totals so part 1 shows real
 * numbers immediately.
 */
export async function getFinalAssessmentDetail(
  internshipId: string,
): Promise<FinalAssessmentDetail> {
  const context = await loadContext(internshipId);

  const [assessment, summary, documents] = await Promise.all([
    context.assessmentId
      ? prisma.finalAssessment.findUnique({
          where: { id: context.assessmentId },
          select: FINAL_ASSESSMENT_SELECT,
        })
      : Promise.resolve(null),
    getAttendanceSummary(internshipId),
    getFinalChecklist(internshipId),
  ]);

  return {
    assessment: assessment ? serializeFinalAssessment(assessment) : null,
    access: resolveAccess(context),
    totalDaysAttended: summary.daysAttended,
    totalHours: summary.totalHours,
    documents,
  };
}

/**
 * Guards a student write.
 *
 * Staff bypass the unlock gate — a faculty member correcting a record should not
 * have to unlock it for themselves first — but they cannot bypass the audit trail.
 */
function assertWritable(auth: AuthContext, context: AssessmentContext): void {
  if (isStaff(auth)) return;

  if (context.status === 'pending' || context.status === 'rejected') {
    throw conflict('Your internship registration is not approved.');
  }

  const access = resolveAccess(context);

  if (!access.unlocked) {
    throw forbidden(
      'The final assessment opens on your internship end date. Ask your faculty coordinator for early access.',
    );
  }

  if (context.submittedAt) {
    throw forbidden(
      'Your final assessment has been submitted. Ask your faculty coordinator to reopen it.',
    );
  }
}

/**
 * Creates or updates the draft.
 *
 * Skill ratings are replaced wholesale rather than merged when supplied: the form
 * always sends the full set it knows about, and a partial merge would leave a stale
 * rating for a slider the student moved back to "unrated".
 */
export async function upsertFinalAssessment(
  auth: AuthContext,
  input: UpsertFinalAssessmentInput,
) {
  const context = await loadContext(input.internshipId);
  assertWritable(auth, context);

  const summary = await getAttendanceSummary(input.internshipId);

  const data = {
    completedSuccessfully: input.completedSuccessfully ?? null,
    // Auto-filled from attendance, never from the request (01_PRD §4.5).
    totalDaysAttended: summary.daysAttended,
    totalHours: summary.totalHours,
    majorProject: input.majorProject ?? null,
    technologiesMastered: input.technologiesMastered ?? [],
    skillsDeveloped: input.skillsDeveloped ?? [],
    objectivesStatus: input.objectivesStatus ?? null,
    usefulnessRating: input.usefulnessRating ?? null,
    technicalImprovement: input.technicalImprovement ?? null,
    employabilityImprovement: input.employabilityImprovement ?? null,
    curriculumRelation: input.curriculumRelation ?? null,
    realWorldExposure: input.realWorldExposure ?? null,
    recommendOrganisation: input.recommendOrganisation ?? null,
    suggestions: input.suggestions ?? null,
  };

  return prisma.$transaction(async (tx) => {
    const assessment = await tx.finalAssessment.upsert({
      where: { internshipId: input.internshipId },
      create: {
        internshipId: input.internshipId,
        studentId: context.studentId,
        ...data,
      },
      update: data,
      select: { id: true },
    });

    if (input.skillRatings) {
      await tx.skillRating.deleteMany({ where: { finalAssessmentId: assessment.id } });
      if (input.skillRatings.length > 0) {
        await tx.skillRating.createMany({
          data: input.skillRatings.map((rating) => ({
            finalAssessmentId: assessment.id,
            skillType: rating.skillType,
            rating: rating.rating,
          })),
        });
      }
    }

    return tx.finalAssessment.findUniqueOrThrow({
      where: { id: assessment.id },
      select: FINAL_ASSESSMENT_SELECT,
    });
  });
}

/**
 * Final submission.
 *
 * `submitFinalAssessmentSchema` has already checked that all eight skills are rated
 * and the required fields are present, so this writes the complete record, stamps
 * `submitted_at`, and marks the internship completed — which is what moves the
 * student out of the faculty's active list.
 */
export async function submitFinalAssessment(
  auth: AuthContext,
  internshipId: string,
  input: SubmitFinalAssessmentInput,
) {
  const context = await loadContext(internshipId);
  assertWritable(auth, context);

  const summary = await getAttendanceSummary(internshipId);

  const assessment = await prisma.$transaction(async (tx) => {
    const record = await tx.finalAssessment.upsert({
      where: { internshipId },
      create: {
        internshipId,
        studentId: context.studentId,
        completedSuccessfully: input.completedSuccessfully,
        objectivesStatus: input.objectivesStatus,
        usefulnessRating: input.usefulnessRating,
        majorProject: input.majorProject,
        totalDaysAttended: summary.daysAttended,
        totalHours: summary.totalHours,
        submittedAt: new Date(),
      },
      update: {
        completedSuccessfully: input.completedSuccessfully,
        objectivesStatus: input.objectivesStatus,
        usefulnessRating: input.usefulnessRating,
        majorProject: input.majorProject,
        totalDaysAttended: summary.daysAttended,
        totalHours: summary.totalHours,
        submittedAt: new Date(),
      },
      select: { id: true },
    });

    // Replace the full set: the submit payload carries all eight.
    await tx.skillRating.deleteMany({ where: { finalAssessmentId: record.id } });
    await tx.skillRating.createMany({
      data: input.skillRatings.map((rating) => ({
        finalAssessmentId: record.id,
        skillType: rating.skillType,
        rating: rating.rating,
      })),
    });

    // The internship is now finished; 06_App_Flow §6 has faculty notified and the
    // dashboard updated off the back of this.
    await tx.internship.update({
      where: { id: internshipId },
      data: { status: 'completed' },
    });

    return tx.finalAssessment.findUniqueOrThrow({
      where: { id: record.id },
      select: FINAL_ASSESSMENT_SELECT,
    });
  });

  await recordAudit({
    action: 'final_assessment_submitted',
    entityType: 'final_assessment',
    entityId: assessment.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      internshipId,
      totalDaysAttended: summary.daysAttended,
      totalHours: summary.totalHours,
      skillsRated: input.skillRatings.length,
      expectedSkills: SKILL_TYPES.length,
    },
  });

  return assessment;
}

/**
 * Faculty unlock — serves both documented purposes of
 * `POST /api/final-assessment/:id/unlock`:
 *
 *   - early access before the end date (02_SRS §2.5), and
 *   - reopening an already-submitted assessment for correction.
 *
 * Reopening clears `submitted_at` and returns the internship to `active`, otherwise
 * the student would be locked out of a record they have been asked to fix. Audited
 * as High sensitivity either way, with the reason recorded.
 */
export async function unlockFinalAssessment(
  auth: AuthContext,
  internshipId: string,
  reason: string | null,
) {
  const context = await loadContext(internshipId);
  const wasSubmitted = context.submittedAt !== null;

  const assessment = await prisma.$transaction(async (tx) => {
    const record = await tx.finalAssessment.upsert({
      where: { internshipId },
      create: {
        internshipId,
        studentId: context.studentId,
        facultyUnlockedAt: new Date(),
        facultyUnlockedById: auth.userId,
      },
      update: {
        facultyUnlockedAt: new Date(),
        facultyUnlockedById: auth.userId,
        ...(wasSubmitted ? { submittedAt: null } : {}),
      },
      select: { id: true },
    });

    if (wasSubmitted) {
      await tx.internship.update({
        where: { id: internshipId },
        data: { status: 'active' },
      });
    }

    return tx.finalAssessment.findUniqueOrThrow({
      where: { id: record.id },
      select: FINAL_ASSESSMENT_SELECT,
    });
  });

  await recordAudit({
    action: wasSubmitted ? 'final_assessment_reopened' : 'settings_changed',
    entityType: 'final_assessment',
    entityId: assessment.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      internshipId,
      reason,
      mode: wasSubmitted ? 'reopened_after_submission' : 'early_access_granted',
    },
    strict: true,
  });

  const student = await prisma.student.findUnique({
    where: { id: context.studentId },
    select: { userId: true },
  });

  if (student) {
    await sendNotification({
      ...(wasSubmitted
        ? NOTIFICATIONS.finalAssessmentReopened()
        : NOTIFICATIONS.finalAssessmentDue(0)),
      userId: student.userId,
    });
  }

  return assessment;
}
