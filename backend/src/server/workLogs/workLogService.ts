/**
 * Daily work log writes — 01_PRD §4.3, 02_SRS §2.3, 05_API_Spec.
 *
 * Mirrors `attendanceService`: one write path shared by the online endpoint and the
 * offline batch, with `client_id` as the idempotency key and
 * `(internship_id, work_date)` as the per-day uniqueness guarantee.
 *
 * The 200-word activities cap and 100-word learning cap are enforced by the shared
 * Zod schema before this runs, so they are not re-checked here — the same schema
 * drives the live counters in the app, which is the point of sharing it.
 */

import type { SyncResultStatus } from '@ims/shared-types';
import type { CreateWorkLogInput, UpdateWorkLogInput } from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { toDateColumn } from '@/lib/clock';
import { conflict, notFound, validationError } from '@/lib/errors';
import { buildDiff, recordAudit } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/context';
import { assertDateWithinInternship, loadInternshipWindow } from '@/server/attendance/attendanceService';

export const WORK_LOG_SELECT = {
  id: true,
  internshipId: true,
  studentId: true,
  workDate: true,
  activities: true,
  technologies: true,
  taskAssigned: true,
  completionStatus: true,
  learning: true,
  challenge: true,
  solution: true,
  deliverableType: true,
  evidenceDocumentId: true,
  mentorInteraction: true,
  mentorFeedback: true,
  clientId: true,
  syncedAt: true,
  createdAt: true,
  updatedAt: true,
  evidenceDocument: {
    select: {
      id: true,
      ownerUserId: true,
      documentType: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      checksum: true,
      uploadedAt: true,
      verifiedAt: true,
      verificationStatus: true,
      rejectionReason: true,
    },
  },
} as const;

export type WorkLogRecord = Awaited<
  ReturnType<typeof prisma.dailyWorkLog.findFirstOrThrow<{ select: typeof WORK_LOG_SELECT }>>
>;

export interface UpsertWorkLogResult {
  status: Extract<SyncResultStatus, 'created' | 'duplicate'>;
  record: WorkLogRecord;
}

/**
 * 02_SRS §2.3: evidence upload is "gated by 'Is the organisation permitting
 * evidence uploads?' setting".
 *
 * Enforced server-side rather than only hiding the button, so a client that ignores
 * the flag cannot attach evidence the organisation has not permitted. This also
 * backs the privacy rule in 01_PRD §4.8 about not collecting proprietary material.
 */
async function assertEvidenceAllowed(
  internshipId: string,
  evidenceDocumentId: string | null | undefined,
): Promise<void> {
  if (!evidenceDocumentId) return;

  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { evidenceUploadsPermitted: true },
  });

  if (!internship?.evidenceUploadsPermitted) {
    throw validationError('This organisation has not permitted evidence uploads.', {
      evidenceDocumentId:
        'Evidence uploads are turned off for this internship. Ask your faculty coordinator.',
    });
  }
}

export async function upsertWorkLog(
  auth: AuthContext,
  input: CreateWorkLogInput,
  options?: { fromSync?: boolean },
): Promise<UpsertWorkLogResult> {
  const internship = await loadInternshipWindow(input.internshipId);

  if (internship.status === 'pending') {
    throw conflict('Your internship registration is still awaiting approval.');
  }
  if (internship.status === 'rejected') {
    throw conflict('This internship registration was not approved.');
  }

  assertDateWithinInternship(internship, input.workDate, 'workDate');
  await assertEvidenceAllowed(input.internshipId, input.evidenceDocumentId);

  // 1. Same submission replayed from a device.
  if (input.clientId) {
    const existing = await prisma.dailyWorkLog.findUnique({
      where: { clientId: input.clientId },
      select: WORK_LOG_SELECT,
    });
    if (existing) {
      return { status: 'duplicate', record: existing };
    }
  }

  // 2. A log already exists for this day.
  const sameDay = await prisma.dailyWorkLog.findUnique({
    where: {
      internshipId_workDate: {
        internshipId: input.internshipId,
        workDate: toDateColumn(input.workDate),
      },
    },
    select: WORK_LOG_SELECT,
  });

  if (sameDay) {
    if (options?.fromSync) {
      return { status: 'duplicate', record: sameDay };
    }
    throw conflict('A work log for this date already exists.', {
      workDate: 'Already recorded. Edit the existing entry instead.',
    });
  }

  const record = await prisma.dailyWorkLog.create({
    data: {
      internshipId: input.internshipId,
      // Derived from the internship, never trusted from the client.
      studentId: internship.studentId,
      workDate: toDateColumn(input.workDate),
      activities: input.activities,
      technologies: input.technologies ?? [],
      taskAssigned: input.taskAssigned ?? null,
      completionStatus: input.completionStatus ?? null,
      learning: input.learning ?? null,
      challenge: input.challenge ?? null,
      solution: input.solution ?? null,
      deliverableType: input.deliverableType ?? null,
      evidenceDocumentId: input.evidenceDocumentId ?? null,
      mentorInteraction: input.mentorInteraction ?? false,
      mentorFeedback: input.mentorFeedback ?? null,
      clientId: input.clientId ?? null,
      syncedAt: options?.fromSync ? new Date() : null,
    },
    select: WORK_LOG_SELECT,
  });

  await recordAudit({
    action: 'work_log_created',
    entityType: 'daily_work_log',
    entityId: record.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      workDate: input.workDate,
      technologies: input.technologies ?? [],
      viaSync: options?.fromSync ?? false,
    },
  });

  return { status: 'created', record };
}

export async function updateWorkLog(
  auth: AuthContext,
  workLogId: string,
  input: UpdateWorkLogInput,
): Promise<WorkLogRecord> {
  const before = await prisma.dailyWorkLog.findUnique({
    where: { id: workLogId },
    select: WORK_LOG_SELECT,
  });
  if (!before) throw notFound('Work log not found.');

  if (input.workDate) {
    const internship = await loadInternshipWindow(before.internshipId);
    assertDateWithinInternship(internship, input.workDate, 'workDate');
  }

  if (input.evidenceDocumentId) {
    await assertEvidenceAllowed(before.internshipId, input.evidenceDocumentId);
  }

  const record = await prisma.dailyWorkLog.update({
    where: { id: workLogId },
    data: {
      ...(input.workDate !== undefined ? { workDate: toDateColumn(input.workDate) } : {}),
      ...(input.activities !== undefined ? { activities: input.activities } : {}),
      ...(input.technologies !== undefined ? { technologies: input.technologies } : {}),
      ...(input.taskAssigned !== undefined ? { taskAssigned: input.taskAssigned } : {}),
      ...(input.completionStatus !== undefined
        ? { completionStatus: input.completionStatus }
        : {}),
      ...(input.learning !== undefined ? { learning: input.learning } : {}),
      ...(input.challenge !== undefined ? { challenge: input.challenge } : {}),
      ...(input.solution !== undefined ? { solution: input.solution } : {}),
      ...(input.deliverableType !== undefined ? { deliverableType: input.deliverableType } : {}),
      ...(input.evidenceDocumentId !== undefined
        ? { evidenceDocumentId: input.evidenceDocumentId }
        : {}),
      ...(input.mentorInteraction !== undefined
        ? { mentorInteraction: input.mentorInteraction }
        : {}),
      ...(input.mentorFeedback !== undefined ? { mentorFeedback: input.mentorFeedback } : {}),
    },
    select: WORK_LOG_SELECT,
  });

  await recordAudit({
    action: 'work_log_edited',
    entityType: 'daily_work_log',
    entityId: workLogId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { changes: buildDiff(before, record) },
  });

  return record;
}
