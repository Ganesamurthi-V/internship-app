/**
 * Mentor invite links — now uses Supabase Auth inviteUserByEmail.
 *
 * When faculty issues an invite, a Supabase Auth account is created for the mentor
 * with an invite email. The mentor clicks the link, sets a password through
 * Supabase's flow, and can then sign in. The app creates the application user
 * record on first login (auto-provisioning in the login route).
 */

import { randomUUID } from 'node:crypto';
import type { MentorInviteContext } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { forbidden, notFound, validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/context';
import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';

export interface IssuedInvite {
  inviteUrl: string;
  expiresAt: Date;
}

/**
 * Issues an invite for a mentor via Supabase Auth.
 *
 * Creates a Supabase Auth user with an invite (which sends them an email), and
 * stores a simple token on the mentors row so the public validation endpoint works.
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

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const inviteToken = randomUUID();

  // Store the invite token on the mentor record
  await prisma.mentor.update({
    where: { id: mentorId },
    data: { inviteToken, inviteExpires: expiresAt },
  });

  // If the mentor doesn't have a Supabase Auth account yet, invite them
  if (!mentor.userId) {
    await supabaseAdmin().auth.admin.inviteUserByEmail(mentor.email, {
      data: { role: 'mentor', name: mentor.name, mentorId },
      redirectTo: `${env.WEB_APP_URL}/mentor/invite/${inviteToken}`,
    });
  }

  const inviteUrl = `${env.WEB_APP_URL}/mentor/invite/${inviteToken}`;

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
 */
export async function validateMentorInvite(token: string): Promise<MentorInviteContext> {
  const mentor = await prisma.mentor.findFirst({
    where: { inviteToken: token },
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
 * Accepts a mentor invite — links the mentor to their Supabase Auth account.
 * Called after the mentor signs in through the Supabase invite email.
 */
export async function acceptMentorInvite(
  token: string,
  authId: string,
  email: string,
): Promise<{ userId: string; email: string }> {
  const mentor = await prisma.mentor.findFirst({
    where: { inviteToken: token },
    select: { id: true, name: true, email: true, userId: true, inviteExpires: true },
  });

  if (!mentor || !mentor.inviteExpires || mentor.inviteExpires.getTime() <= Date.now()) {
    throw notFound('This invite link is invalid or has expired.');
  }

  if (mentor.userId) {
    throw forbidden('An account already exists for this mentor. Sign in instead.');
  }

  // Create or find the application user
  let user = await prisma.user.findUnique({ where: { authId }, select: { id: true, email: true } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        authId,
        email,
        role: 'mentor',
        status: 'active',
        name: mentor.name,
      },
      select: { id: true, email: true },
    });
  }

  // Link mentor record and consume the invite
  await prisma.mentor.update({
    where: { id: mentor.id },
    data: { userId: user.id, inviteToken: null, inviteExpires: null },
  });

  return { userId: user.id, email: user.email };
}
