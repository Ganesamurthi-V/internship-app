/**
 * Internship registration and approval â€” 01_PRD Â§4.1, 02_SRS Â§2.1, 06_App_Flow Â§3.
 *
 * Business rules enforced here:
 *   - `end_date >= start_date`, and working hours per day positive (also CHECK
 *     constraints, validated in Zod first so the user gets a field message).
 *   - `duration_days` is computed server-side and never accepted from the client.
 *   - One active internship per student, unless the institution overrides it.
 *   - Registration cannot be submitted without the offer letter and joining proof.
 *   - Approval and rejection are faculty/admin only and both are audited as
 *     High-sensitivity events (07_Security_and_Privacy Â§9).
 */

import type { CreateInternshipInput, UpdateInternshipInput } from '@ims/shared-validation';
import { REGISTRATION_REQUIRED_DOCUMENTS } from '@ims/shared-types';
import { calculateInternshipDuration, daysBetween } from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { conflict, forbidden, notFound, validationError } from '@/lib/errors';
import { toDateColumn } from '@/lib/clock';
import { recordAudit, buildDiff } from '@/lib/audit';
import { NOTIFICATIONS, sendNotification } from '@/lib/notifications';
import type { AuthContext } from '@/lib/auth/context';
import { isAdmin } from '@/lib/auth/guards';

export const INTERNSHIP_SELECT = {
  id: true,
  studentId: true,
  organisationId: true,
  mentorId: true,
  facultyCoordinatorId: true,
  domain: true,
  mode: true,
  startDate: true,
  endDate: true,
  durationDays: true,
  workingHoursPerDay: true,
  status: true,
  approvedById: true,
  approvedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  organisation: {
    select: { id: true, name: true, location: true, createdAt: true, updatedAt: true },
  },
  mentor: {
    select: {
      id: true,
      userId: true,
      name: true,
      designation: true,
      email: true,
      contact: true,
      organisationId: true,
      inviteToken: true,
      inviteExpires: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

/**
 * Statuses that occupy the "one at a time" slot. A completed or rejected
 * internship does not block registering the next one.
 */
const OCCUPYING_STATUSES: Prisma.EnumInternshipStatusFilter = {
  in: ['pending', 'approved', 'active'],
};

/**
 * `duration_days` mirrors the document's generated column, which is
 * `end_date - start_date` â€” an exclusive span. `calculateInternshipDuration`
 * returns the inclusive figures users see; the two are intentionally different and
 * the CHECK constraint pins this one to the subtraction.
 */
function computeDurationDays(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate);
}

export async function createInternship(
  auth: AuthContext,
  studentId: string,
  input: CreateInternshipInput,
) {
  if (!env.ALLOW_MULTIPLE_ACTIVE_INTERNSHIPS) {
    const existing = await prisma.internship.findFirst({
      where: { studentId, status: OCCUPYING_STATUSES },
      select: { id: true, status: true },
    });

    if (existing) {
      throw conflict(
        'You already have an internship registration in progress. Complete or withdraw it first.',
        { _: `An internship is already ${existing.status}.` },
      );
    }
  }

  await assertFacultyCoordinatorValid(input.facultyCoordinatorId);

  const organisationId = await resolveOrganisation(input);
  const mentorId = await resolveMentor(input, organisationId);

  const internship = await prisma.internship.create({
    data: {
      studentId,
      organisationId,
      mentorId,
      facultyCoordinatorId: input.facultyCoordinatorId ?? null,
      domain: input.domain,
      mode: input.mode,
      startDate: toDateColumn(input.startDate),
      endDate: toDateColumn(input.endDate),
      durationDays: computeDurationDays(input.startDate, input.endDate),
      workingHoursPerDay: input.workingHoursPerDay,
      status: 'pending',
    },
    select: INTERNSHIP_SELECT,
  });

  return internship;
}

export async function updateInternship(
  auth: AuthContext,
  internshipId: string,
  input: UpdateInternshipInput,
) {
  const before = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { ...INTERNSHIP_SELECT, submittedAt: true },
  });
  if (!before) throw notFound('Internship not found.');

  /**
   * A student may only edit their own registration while it is still pending or
   * was sent back. Once faculty has approved it, the dates and organisation are
   * evidence and only staff may correct them.
   */
  const isOwner = auth.studentId === before.studentId;
  if (isOwner && !isAdmin(auth)) {
    if (before.status !== 'pending' && before.status !== 'rejected') {
      throw forbidden(
        'This registration has already been approved. Ask your faculty coordinator to make changes.',
      );
    }
  }

  // Dates are validated as a pair: patching only one still has to leave a valid range.
  const startDate = input.startDate ?? formatDate(before.startDate);
  const endDate = input.endDate ?? formatDate(before.endDate);
  if (daysBetween(startDate, endDate) < 0) {
    throw validationError('End date must be on or after the start date.', {
      endDate: 'End date must be on or after the start date.',
    });
  }

  if (input.facultyCoordinatorId !== undefined) {
    await assertFacultyCoordinatorValid(input.facultyCoordinatorId);
  }

  const organisationId =
    input.organisationId !== undefined || input.organisationName !== undefined
      ? await resolveOrganisation(input)
      : undefined;

  const updated = await prisma.internship.update({
    where: { id: internshipId },
    data: {
      ...(organisationId !== undefined ? { organisationId } : {}),
      ...(input.facultyCoordinatorId !== undefined
        ? { facultyCoordinatorId: input.facultyCoordinatorId }
        : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.startDate !== undefined ? { startDate: toDateColumn(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: toDateColumn(input.endDate) } : {}),
      // Recomputed whenever either date moves, so the CHECK constraint holds.
      ...(input.startDate !== undefined || input.endDate !== undefined
        ? { durationDays: computeDurationDays(startDate, endDate) }
        : {}),
      ...(input.workingHoursPerDay !== undefined
        ? { workingHoursPerDay: input.workingHoursPerDay }
        : {}),
    },
    select: INTERNSHIP_SELECT,
  });

  if (input.mentorName || input.mentorEmail || input.mentorDesignation || input.mentorContact) {
    await updateMentorDetails(updated.mentorId, input, updated.organisationId);
  }

  return updated;
}

/**
 * Submits the registration for approval.
 *
 * 01_PRD Â§4.1 requires the offer/confirmation letter and the joining proof, so the
 * gate is checked here rather than trusting the wizard's own step-3 validation â€”
 * the client could skip it.
 */
export async function submitInternship(auth: AuthContext, internshipId: string) {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { id: true, studentId: true, status: true, submittedAt: true },
  });
  if (!internship) throw notFound('Internship not found.');

  if (internship.status === 'approved' || internship.status === 'active') {
    throw conflict('This registration has already been approved.');
  }

  const documents = await prisma.document.findMany({
    where: {
      internshipId,
      deletedAt: null,
      documentType: { in: [...REGISTRATION_REQUIRED_DOCUMENTS] },
    },
    select: { documentType: true },
  });

  const uploaded = new Set(documents.map((document) => document.documentType));
  const missing = REGISTRATION_REQUIRED_DOCUMENTS.filter((type) => !uploaded.has(type));

  if (missing.length > 0) {
    throw validationError('Upload the required documents before submitting.', {
      documents: `Missing: ${missing.join(', ')}.`,
    });
  }

  const updated = await prisma.internship.update({
    where: { id: internshipId },
    data: {
      status: 'pending',
      submittedAt: new Date(),
      // Clear a previous rejection so the student is not shown a stale reason.
      rejectionReason: null,
    },
    select: INTERNSHIP_SELECT,
  });

  await recordAudit({
    action: 'internship_submitted',
    entityType: 'internship',
    entityId: internshipId,
    actorUserId: auth.userId,
    context: auth.request,
  });

  await notifyCoordinator(updated.facultyCoordinatorId);

  return updated;
}

export async function approveInternship(
  auth: AuthContext,
  internshipId: string,
  note: string | null,
) {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { id: true, status: true, studentId: true, startDate: true },
  });
  if (!internship) throw notFound('Internship not found.');

  if (internship.status === 'approved' || internship.status === 'active') {
    throw conflict('This internship is already approved.');
  }

  const updated = await prisma.internship.update({
    where: { id: internshipId },
    data: {
      status: 'approved',
      approvedById: auth.userId,
      approvedAt: new Date(),
      rejectionReason: null,
    },
    select: INTERNSHIP_SELECT,
  });

  await recordAudit({
    action: 'internship_approved',
    entityType: 'internship',
    entityId: internshipId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { note },
    // High sensitivity per 07_Security_and_Privacy Â§9.
    strict: true,
  });

  await notifyStudent(internship.studentId, NOTIFICATIONS.internshipApproved());

  return updated;
}

export async function rejectInternship(
  auth: AuthContext,
  internshipId: string,
  rejectionReason: string,
) {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { id: true, status: true, studentId: true },
  });
  if (!internship) throw notFound('Internship not found.');

  const updated = await prisma.internship.update({
    where: { id: internshipId },
    data: { status: 'rejected', rejectionReason, approvedById: null, approvedAt: null },
    select: INTERNSHIP_SELECT,
  });

  await recordAudit({
    action: 'internship_rejected',
    entityType: 'internship',
    entityId: internshipId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { rejectionReason },
    strict: true,
  });

  await notifyStudent(internship.studentId, NOTIFICATIONS.internshipRejected());

  return updated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the organisation, creating it if the student typed a new name.
 *
 * Upsert by name means two students at the same company converge on one
 * organisation row, which is what makes the organisation-wise statistics in
 * 02_SRS Â§7 meaningful.
 */
async function resolveOrganisation(input: {
  organisationId?: string | null | undefined;
  organisationName?: string | undefined;
  organisationLocation?: string | undefined;
}): Promise<string | null> {
  if (input.organisationId) {
    const exists = await prisma.organisation.count({ where: { id: input.organisationId } });
    if (exists === 0) {
      throw validationError('That organisation does not exist.', {
        organisationId: 'Unknown organisation.',
      });
    }
    return input.organisationId;
  }

  if (!input.organisationName) return null;

  const organisation = await prisma.organisation.upsert({
    where: { name: input.organisationName },
    create: {
      name: input.organisationName,
      location: input.organisationLocation ?? null,
    },
    // Fill in a location if the first student to register did not supply one, but
    // never overwrite an existing value with null.
    update: input.organisationLocation ? { location: input.organisationLocation } : {},
    select: { id: true },
  });

  return organisation.id;
}

/**
 * Creates the mentor record from the details the student typed.
 *
 * No account is created here. The mentor gets access through a secure invite link
 * (08_Implementation_Plan Phase 0: "Web invite link (no app install)"), issued
 * separately by faculty.
 */
async function resolveMentor(
  input: {
    mentorName?: string | undefined;
    mentorDesignation?: string | undefined;
    mentorEmail?: string | undefined;
    mentorContact?: string | undefined;
  },
  organisationId: string | null,
): Promise<string | null> {
  if (!input.mentorName) return null;

  // Reuse an existing mentor at the same organisation with the same email, so one
  // mentor supervising several students is one row.
  if (input.mentorEmail) {
    const existing = await prisma.mentor.findFirst({
      where: { email: input.mentorEmail, organisationId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const mentor = await prisma.mentor.create({
    data: {
      name: input.mentorName,
      designation: input.mentorDesignation ?? null,
      email: input.mentorEmail ?? null,
      contact: input.mentorContact ?? null,
      organisationId,
    },
    select: { id: true },
  });

  return mentor.id;
}

async function updateMentorDetails(
  mentorId: string | null,
  input: UpdateInternshipInput,
  organisationId: string | null,
): Promise<void> {
  if (!mentorId) return;

  await prisma.mentor.update({
    where: { id: mentorId },
    data: {
      ...(input.mentorName !== undefined ? { name: input.mentorName } : {}),
      ...(input.mentorDesignation !== undefined ? { designation: input.mentorDesignation } : {}),
      ...(input.mentorEmail !== undefined ? { email: input.mentorEmail } : {}),
      ...(input.mentorContact !== undefined ? { contact: input.mentorContact } : {}),
      ...(organisationId ? { organisationId } : {}),
    },
  });
}

/** A coordinator must be an existing faculty or admin account. */
async function assertFacultyCoordinatorValid(
  facultyCoordinatorId: string | null | undefined,
): Promise<void> {
  if (!facultyCoordinatorId) return;

  const coordinator = await prisma.user.findUnique({
    where: { id: facultyCoordinatorId },
    select: { role: true, status: true },
  });

  if (!coordinator || coordinator.status !== 'active') {
    throw validationError('That faculty coordinator does not exist.', {
      facultyCoordinatorId: 'Unknown coordinator.',
    });
  }

  if (coordinator.role !== 'faculty' && coordinator.role !== 'admin') {
    throw validationError('The selected coordinator is not a faculty member.', {
      facultyCoordinatorId: 'Must be a faculty coordinator.',
    });
  }
}

async function notifyStudent(
  studentId: string,
  notification: Omit<Parameters<typeof sendNotification>[0], 'userId'>,
): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { userId: true },
  });
  if (!student) return;
  await sendNotification({ ...notification, userId: student.userId });
}

/** Lets the coordinator know a registration is waiting, if one is assigned. */
async function notifyCoordinator(facultyCoordinatorId: string | null): Promise<void> {
  if (!facultyCoordinatorId) return;
  await sendNotification({
    userId: facultyCoordinatorId,
    type: 'internship_approved',
    title: 'Registration awaiting approval',
    body: 'A student has submitted an internship registration for review.',
    data: { screen: '/(faculty)/dashboard' },
  });
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export { calculateInternshipDuration };
