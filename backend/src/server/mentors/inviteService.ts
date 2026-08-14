/**
 * Mentor invite links — 02_SRS §1.4, 08_Implementation_Plan Phase 0 and Phase 5.
 *
 * Phase 0 chooses "Web invite link (no app install)" as the mentor access path, so
 * a mentor never has to create an account through the mobile app. Faculty issues a
 * link, the mentor opens it on any device, and can either complete the evaluation
 * through the link or set a password to get a full account.
 *
 * Token handling matches password reset: 32 random bytes, only the SHA-256 hash
 * stored, time-limited. The plaintext exists once, inside the emailed URL.
 *
 * Note the token lives on `mentors`, not on `internships` (that is where
 * 04_Database_Design §2 puts it). One mentor supervising several students therefore
 * has one link, and after opening it they see all of their assigned students.
 */

import type { MentorInviteContext } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { forbidden, notFound, validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import type { RequestContext } from '@/lib/http';
import type { AuthContext } from '@/lib/auth/context';
import { generateSingleUseToken, hashSingleUseToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { mentorInviteEmail, sendMail } from '@/lib/mailer';
import { env } from '@/lib/env';

export interface IssuedInvite {
  /** Absolute URL to hand to the mentor. Contains the only copy of the token. */
  inviteUrl: string;
  expiresAt: Date;
}

/**
 * Issues (or reissues) an invite for a mentor.
 *
 * Reissuing replaces the previous token, so an old forwarded email stops working.
 */
export async function createMentorInvite(
  auth: AuthContext,
  mentorId: string,
  expiresInDays: number,
): Promise<IssuedInvite> {
  const mentor = await prisma.mentor.findUnique({
    where: { id: mentorId },
    select: {
      id: true,
      name: true,
      email: true,
      userId: true,
      internships: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { student: { select: { name: true } } },
      },
    },
  });

  if (!mentor) throw notFound('Mentor not found.');

  if (!mentor.email) {
    throw validationError('This mentor has no email address on file.', {
      email: 'Add an email address before sending an invite.',
    });
  }

  const { token, tokenHash } = generateSingleUseToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await prisma.mentor.update({
    where: { id: mentorId },
    data: { inviteToken: tokenHash, inviteExpires: expiresAt },
  });

  const inviteUrl = `${env.WEB_APP_URL}/mentor/invite/${encodeURIComponent(token)}`;

  await sendMail(
    mentorInviteEmail({
      to: mentor.email,
      mentorName: mentor.name,
      studentName: mentor.internships[0]?.student.name ?? 'a student',
      token,
      expiresAt,
    }),
  );

  await recordAudit({
    action: 'mentor_invite_created',
    entityType: 'mentor',
    entityId: mentorId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return { inviteUrl, expiresAt };
}

/**
 * Validates an invite token for the public landing page.
 *
 * This endpoint is unauthenticated, so the response is kept to the minimum a
 * mentor needs in order to recognise the request as legitimate: their own name,
 * the organisation, and the student they are being asked about. No contact
 * details, no register-number-linked records, nothing about other students
 * (07_Security_and_Privacy §8).
 *
 * An invalid or expired token yields 404 rather than a description of what is
 * wrong, so the endpoint cannot be used to probe for live tokens.
 */
export async function validateMentorInvite(token: string): Promise<MentorInviteContext> {
  const mentor = await prisma.mentor.findUnique({
    where: { inviteToken: hashSingleUseToken(token) },
    select: {
      id: true,
      name: true,
      inviteExpires: true,
      organisation: { select: { name: true } },
      internships: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          student: { select: { name: true, registerNumber: true } },
          mentorEvaluation: { select: { digitalConfirmation: true } },
        },
      },
    },
  });

  if (!mentor || !mentor.inviteExpires || mentor.inviteExpires.getTime() <= Date.now()) {
    throw notFound('This invite link is invalid or has expired.');
  }

  const internship = mentor.internships[0];
  if (!internship) {
    throw notFound('This invite link is no longer linked to an internship.');
  }

  return {
    valid: true,
    mentorName: mentor.name,
    organisationName: mentor.organisation?.name ?? null,
    studentName: internship.student.name,
    studentRegisterNumber: internship.student.registerNumber,
    internshipId: internship.id,
    expiresAt: mentor.inviteExpires.toISOString(),
    alreadySubmitted: internship.mentorEvaluation?.digitalConfirmation ?? false,
  };
}

/**
 * Turns an invite into a real account so the mentor can sign in to the app.
 *
 * The invite is consumed on success (token cleared), and the created user is linked
 * to the existing `mentors` row rather than a new one — otherwise the internship's
 * `mentor_id` would point at a record with no login.
 */
export async function acceptMentorInvite(
  input: { token: string; password: string },
  context: RequestContext,
): Promise<{ userId: string; email: string }> {
  const tokenHash = hashSingleUseToken(input.token);

  const mentor = await prisma.mentor.findUnique({
    where: { inviteToken: tokenHash },
    select: { id: true, name: true, email: true, userId: true, inviteExpires: true },
  });

  if (!mentor || !mentor.inviteExpires || mentor.inviteExpires.getTime() <= Date.now()) {
    throw notFound('This invite link is invalid or has expired.');
  }

  if (!mentor.email) {
    throw validationError('This mentor has no email address on file.');
  }

  if (mentor.userId) {
    throw forbidden('An account already exists for this mentor. Sign in instead.');
  }

  // An email already used by a student or faculty account cannot be reused here;
  // that would let one person hold two roles under one address.
  const existingUser = await prisma.user.findUnique({
    where: { email: mentor.email },
    select: { id: true, role: true },
  });

  if (existingUser) {
    throw forbidden('An account already exists for this email address. Sign in instead.');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: mentor.email!,
        passwordHash,
        role: 'mentor',
        status: 'active',
        name: mentor.name,
      },
      select: { id: true, email: true },
    });

    await tx.mentor.update({
      where: { id: mentor.id },
      // Consume the invite: the link cannot create a second account.
      data: { userId: createdUser.id, inviteToken: null, inviteExpires: null },
    });

    return createdUser;
  });

  await recordAudit({
    action: 'user_created',
    entityType: 'user',
    entityId: user.id,
    actorUserId: user.id,
    context,
    metadata: { role: 'mentor', via: 'invite_link', mentorId: mentor.id },
  });

  return { userId: user.id, email: user.email };
}
