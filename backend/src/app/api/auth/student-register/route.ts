/**
 * POST /api/auth/student-register — creates a new student account.
 *
 * Flow:
 *   1. Validate the registration form (20 fields)
 *   2. Check the register number is not already taken
 *   3. Create a Supabase Auth user (email = studentEmail, password = mobile)
 *   4. Create the User + Student records in Prisma
 *   5. Sign them in and return the session
 *
 * The mobile number becomes their Supabase password. They never see or type it as
 * a "password" — they just enter their mobile on the login screen.
 */

import type { NextRequest } from 'next/server';
import { studentRegisterSchema } from '@ims/shared-validation';
import { created, parseJson, withErrorHandling } from '@/lib/http';
import { conflict, serverError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase';
import { buildAuthenticatedUser } from '@/server/auth/identity';
import { recordAudit } from '@/lib/audit';
import { getRequestContext } from '@/lib/http';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, studentRegisterSchema);

  // Check register number uniqueness
  const existing = await prisma.student.findUnique({
    where: { registerNumber: input.registerNumber },
    select: { id: true },
  });

  if (existing) {
    throw conflict('This register number is already registered. Use Student Login instead.', {
      registerNumber: 'Already registered.',
    });
  }

  // Check email uniqueness
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.studentEmail },
    select: { id: true },
  });

  if (existingEmail) {
    throw conflict('This email is already in use.', {
      studentEmail: 'Already registered.',
    });
  }

  // Mobile number (stripped) becomes the Supabase password
  const mobile = input.mobile.replace(/[\s()-]/gu, '');

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin().auth.admin.createUser({
    email: input.studentEmail,
    password: mobile,
    email_confirm: true,
    user_metadata: { role: 'student', name: input.name },
  });

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      throw conflict('This email is already registered with the authentication service.', {
        studentEmail: 'Already registered.',
      });
    }
    throw serverError(`Could not create account: ${authError.message}`);
  }

  const authId = authData.user.id;

  // Parse dates for Prisma
  const startDate = input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null;
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null;

  // Create User + Student in a transaction
  try {
    const { user, student } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authId,
          email: input.studentEmail,
          role: 'student',
          status: 'active',
          name: input.name,
        },
        select: { id: true },
      });

      const student = await tx.student.create({
        data: {
          userId: user.id,
          registerNumber: input.registerNumber,
          name: input.name,
          programme: input.programme,
          departmentId: input.departmentId ?? null,
          year: input.year ?? null,
          section: input.section ?? null,
          studentEmail: input.studentEmail,
          mobile,
          organisationName: input.organisationName ?? null,
          organisationLocation: input.organisationLocation ?? null,
          internshipDomain: input.internshipDomain ?? null,
          internshipMode: input.internshipMode ?? null,
          startDate,
          endDate,
          durationDays: input.durationDays ?? null,
          workingHoursPerDay: input.workingHoursPerDay ?? null,
          mentorName: input.mentorName ?? null,
          mentorDesignation: input.mentorDesignation ?? null,
          mentorContact: input.mentorContact ?? null,
          facultyCoordinator: input.facultyCoordinator ?? null,
          offerLetterDocId: input.offerLetterDocId ?? null,
          joiningLetterDocId: input.joiningLetterDocId ?? null,
        },
        select: { id: true },
      });

      return { user, student };
    });

    await recordAudit({
      action: 'user_created',
      entityType: 'student',
      entityId: student.id,
      actorUserId: user.id,
      context: getRequestContext(request),
      metadata: {
        registerNumber: input.registerNumber,
        name: input.name,
        selfRegistered: true,
      },
    });
  } catch (error) {
    // If Prisma fails, clean up the Supabase auth user
    await supabaseAdmin().auth.admin.deleteUser(authId).catch(() => {});
    throw error;
  }

  // Sign in immediately after registration
  const { data: signInData, error: signInError } = await supabaseAdmin().auth.signInWithPassword({
    email: input.studentEmail,
    password: mobile,
  });

  if (signInError || !signInData.session) {
    throw serverError('Account created but could not sign in automatically. Use Student Login.');
  }

  const identity = await buildAuthenticatedUser(authId);

  return created({
    session: {
      accessToken: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token,
      expiresAt: signInData.session.expires_at,
    },
    user: identity,
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
