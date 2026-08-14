/**
 * Attendance writes — 01_PRD §4.2, 02_SRS §2.2, 05_API_Spec "Attendance".
 *
 * The write path is shared by the online endpoint (`POST /api/attendance`) and the
 * offline batch endpoint (`POST /api/sync`), which is why `upsertAttendance`
 * returns a `SyncResultStatus` rather than just the record. Having one
 * implementation is what makes the offline guarantee in 09_Test_Plan §4 hold:
 * "submit duplicate attendance (same date, same student) while offline → only one
 * record created on server".
 *
 * Two independent duplicate defences:
 *   1. `client_id` UNIQUE — a replayed batch resolves to the same row.
 *   2. `(internship_id, attendance_date)` UNIQUE — two different devices writing
 *      the same day cannot both win.
 */

import type { AttendanceStatus, SyncResultStatus } from '@ims/shared-types';
import { NON_WORKING_ATTENDANCE_STATUSES } from '@ims/shared-types';
import type { CreateAttendanceInput, UpdateAttendanceInput } from '@ims/shared-validation';
import { calculateTotalHours, isWithinRange } from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { toDateColumn } from '@/lib/clock';
import { conflict, notFound, validationError } from '@/lib/errors';
import { buildDiff, recordAudit } from '@/lib/audit';
import { toDateOnly } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';

export const ATTENDANCE_SELECT = {
  id: true,
  internshipId: true,
  studentId: true,
  attendanceDate: true,
  status: true,
  reportingTime: true,
  leavingTime: true,
  totalHours: true,
  mode: true,
  proofDocumentId: true,
  leaveReason: true,
  mentorVerified: true,
  mentorVerifiedAt: true,
  clientId: true,
  syncedAt: true,
  createdAt: true,
  updatedAt: true,
  proofDocument: {
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

export type AttendanceRecord = Awaited<
  ReturnType<typeof prisma.attendance.findFirstOrThrow<{ select: typeof ATTENDANCE_SELECT }>>
>;

export interface UpsertResult {
  status: Extract<SyncResultStatus, 'created' | 'duplicate'>;
  record: AttendanceRecord;
}

/**
 * The internship fields needed to validate an attendance date.
 */
interface InternshipWindow {
  id: string;
  studentId: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export async function loadInternshipWindow(internshipId: string): Promise<InternshipWindow> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { id: true, studentId: true, startDate: true, endDate: true, status: true },
  });
  if (!internship) throw notFound('Internship not found.');
  return internship;
}

/**
 * Validates that a record's date sits inside the internship period.
 *
 * 02_SRS §2.4 states this for weekly reports; the same constraint has to hold for
 * daily records or the aggregates would count days outside the internship. Returns
 * field errors so the mobile form can highlight the date picker.
 */
export function assertDateWithinInternship(
  internship: InternshipWindow,
  date: string,
  field = 'date',
): void {
  const start = toDateOnly(internship.startDate);
  const end = toDateOnly(internship.endDate);

  if (!isWithinRange(date, start, end)) {
    throw validationError('That date is outside the internship period.', {
      [field]: `Choose a date between ${start} and ${end}.`,
    });
  }
}

/**
 * Records that the internship must be in a state that accepts submissions.
 * A pending registration has nothing to log against, and a rejected one must not
 * accumulate evidence.
 */
function assertSubmittable(internship: InternshipWindow): void {
  if (internship.status === 'pending') {
    throw conflict('Your internship registration is still awaiting approval.');
  }
  if (internship.status === 'rejected') {
    throw conflict('This internship registration was not approved.');
  }
}

/**
 * Normalises the fields that depend on status.
 *
 * A holiday or weekly off carries no times, mode or hours — if a student picks a
 * status after entering times, the stale times are dropped rather than stored as
 * misleading evidence. Conversely a present day keeps whatever times were given.
 */
function normaliseForStatus(input: {
  status: AttendanceStatus;
  reportingTime?: string | null | undefined;
  leavingTime?: string | null | undefined;
  mode?: string | null | undefined;
  leaveReason?: string | null | undefined;
}) {
  const isNonWorking = NON_WORKING_ATTENDANCE_STATUSES.includes(input.status);

  if (isNonWorking) {
    return {
      reportingTime: null,
      leavingTime: null,
      totalHours: null,
      mode: null,
      // A holiday needs no reason, and the CHECK constraint does not demand one.
      leaveReason: input.leaveReason ?? null,
    };
  }

  const reportingTime = input.reportingTime ?? null;
  const leavingTime = input.leavingTime ?? null;

  return {
    reportingTime,
    leavingTime,
    // Server-computed, replacing the document's generated column. Never read from
    // the request body.
    totalHours: calculateTotalHours(reportingTime, leavingTime),
    mode: (input.mode ?? null) as never,
    leaveReason: input.leaveReason ?? null,
  };
}

/**
 * Creates an attendance record, or resolves to the existing one.
 *
 * Idempotency order matters. `client_id` is checked first because it identifies
 * *this exact submission*, so a retry returns the same row and reports
 * `duplicate`. Only then is the per-day uniqueness checked, which catches a
 * genuinely different submission for a day already recorded.
 */
export async function upsertAttendance(
  auth: AuthContext,
  input: CreateAttendanceInput,
  options?: { fromSync?: boolean },
): Promise<UpsertResult> {
  const internship = await loadInternshipWindow(input.internshipId);
  assertSubmittable(internship);
  assertDateWithinInternship(internship, input.date);

  // 1. Same submission replayed.
  if (input.clientId) {
    const existing = await prisma.attendance.findUnique({
      where: { clientId: input.clientId },
      select: ATTENDANCE_SELECT,
    });
    if (existing) {
      return { status: 'duplicate', record: existing };
    }
  }

  // 2. A record already exists for this day.
  const sameDay = await prisma.attendance.findUnique({
    where: {
      internshipId_attendanceDate: {
        internshipId: input.internshipId,
        attendanceDate: toDateColumn(input.date),
      },
    },
    select: ATTENDANCE_SELECT,
  });

  if (sameDay) {
    if (options?.fromSync) {
      // A sync batch must not fail the whole request over a day the student already
      // recorded online. Report it and let the device reconcile.
      return { status: 'duplicate', record: sameDay };
    }
    throw conflict('Attendance for this date has already been recorded.', {
      date: 'Already recorded. Edit the existing entry instead.',
    });
  }

  const normalised = normaliseForStatus(input);

  const record = await prisma.attendance.create({
    data: {
      internshipId: input.internshipId,
      // Derived from the internship, never from the client
      // (07_Security_and_Privacy §6).
      studentId: internship.studentId,
      attendanceDate: toDateColumn(input.date),
      status: input.status,
      ...normalised,
      proofDocumentId: input.proofDocumentId ?? null,
      clientId: input.clientId ?? null,
      // Marks when an offline record reached the server, per 04_Database_Design.
      syncedAt: options?.fromSync ? new Date() : null,
    },
    select: ATTENDANCE_SELECT,
  });

  await recordAudit({
    action: 'attendance_created',
    entityType: 'attendance',
    entityId: record.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      date: input.date,
      status: input.status,
      viaSync: options?.fromSync ?? false,
    },
  });

  return { status: 'created', record };
}

/**
 * Edits an existing record.
 *
 * 07_Security_and_Privacy §9 audits post-submission attendance edits at Medium
 * sensitivity, so the audit row carries a field-level diff rather than just the fact
 * of an edit.
 */
export async function updateAttendance(
  auth: AuthContext,
  attendanceId: string,
  input: UpdateAttendanceInput,
): Promise<AttendanceRecord> {
  const before = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: ATTENDANCE_SELECT,
  });
  if (!before) throw notFound('Attendance record not found.');

  const internship = await loadInternshipWindow(before.internshipId);

  if (input.date) {
    assertDateWithinInternship(internship, input.date);
  }

  // Recompute against the merged state: patching only `leavingTime` still has to
  // produce correct hours and satisfy the `valid_times` constraint.
  const status = (input.status ?? before.status) as AttendanceStatus;
  const merged = normaliseForStatus({
    status,
    reportingTime:
      input.reportingTime !== undefined ? input.reportingTime : before.reportingTime,
    leavingTime: input.leavingTime !== undefined ? input.leavingTime : before.leavingTime,
    mode: input.mode !== undefined ? input.mode : before.mode,
    leaveReason: input.leaveReason !== undefined ? input.leaveReason : before.leaveReason,
  });

  const record = await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      ...(input.date ? { attendanceDate: toDateColumn(input.date) } : {}),
      status,
      ...merged,
      ...(input.proofDocumentId !== undefined
        ? { proofDocumentId: input.proofDocumentId }
        : {}),
    },
    select: ATTENDANCE_SELECT,
  });

  await recordAudit({
    action: 'attendance_edited',
    entityType: 'attendance',
    entityId: attendanceId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { changes: buildDiff(before, record) },
  });

  return record;
}

/**
 * Mentor (or faculty) verification.
 *
 * 02_SRS §2.2: "Mentor verification is a soft confirmation, not a gate." Nothing
 * about the record's validity changes; only the flag and its timestamp.
 */
export async function setAttendanceVerification(
  auth: AuthContext,
  attendanceId: string,
  verified: boolean,
): Promise<AttendanceRecord> {
  const existing = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { id: true, mentorVerified: true },
  });
  if (!existing) throw notFound('Attendance record not found.');

  const record = await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      mentorVerified: verified,
      mentorVerifiedAt: verified ? new Date() : null,
    },
    select: ATTENDANCE_SELECT,
  });

  await recordAudit({
    action: 'attendance_verified',
    entityType: 'attendance',
    entityId: attendanceId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { verified, previous: existing.mentorVerified },
  });

  return record;
}
