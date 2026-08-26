/**
 * POST /api/auth/student-login — authenticate a student by register number + mobile.
 *
 * Flow:
 *   1. Look up the student by register number
 *   2. Verify the mobile matches
 *   3. Sign them into Supabase using their email + mobile as password
 *   4. Return the session tokens + user identity
 *
 * The mobile number IS the Supabase password for student accounts. That means:
 *   - Students never type a password they have to remember
 *   - Faculty/admin accounts keep real passwords (they use the faculty login)
 *   - A student's mobile is their credential, which they already know
 */

import type { NextRequest } from 'next/server';
import { studentLoginSchema } from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { unauthorized } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { createSupabaseSignInClient, supabaseAdmin } from '@/lib/supabase';
import { buildAuthenticatedUser } from '@/server/auth/identity';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, studentLoginSchema);

  // 1. Find the student
  const student = await prisma.student.findUnique({
    where: { registerNumber: input.registerNumber },
    select: {
      id: true,
      mobile: true,
      studentEmail: true,
      user: { select: { authId: true, status: true } },
    },
  });

  if (!student) {
    throw unauthorized('Register number not found. If you are new, create an account first.');
  }

  // 2. Verify mobile matches (strip formatting for comparison)
  const storedMobile = student.mobile.replace(/[\s()-]/gu, '');
  const inputMobile = input.mobile.replace(/[\s()-]/gu, '');

  if (storedMobile !== inputMobile) {
    throw unauthorized('Mobile number does not match. Check and try again.');
  }

  if (student.user.status !== 'active') {
    if (student.user.status === 'pending') {
      throw unauthorized('Your account is awaiting faculty approval. You will be able to log in once approved.');
    }
    throw unauthorized('Your account has been suspended. Contact your department office.');
  }

  // 3. Sign in via Supabase — the student's Supabase password is their mobile number.
  //
  // A throwaway client, never the shared admin one: signing in would store this
  // student's session on that cached instance and downgrade every later
  // service-role call on the same warm Lambda to `authenticated`.
  const { data: signInData, error: signInError } = await createSupabaseSignInClient().auth.signInWithPassword({
    email: student.studentEmail,
    password: storedMobile,
  });

  if (signInError || !signInData.session) {
    // This can happen if the Supabase Auth user has a different password.
    // Resetting it needs service-role, so that call does use the admin client.
    await supabaseAdmin().auth.admin.updateUserById(student.user.authId, {
      password: storedMobile,
    });

    // Retry sign-in on a fresh client, for the same reason as above.
    const { data: retryData, error: retryError } = await createSupabaseSignInClient().auth.signInWithPassword({
      email: student.studentEmail,
      password: storedMobile,
    });

    if (retryError || !retryData.session) {
      throw unauthorized('Could not sign in. Contact your department office.');
    }

    const user = await buildAuthenticatedUser(student.user.authId);

    return ok({
      session: {
        accessToken: retryData.session.access_token,
        refreshToken: retryData.session.refresh_token,
        expiresAt: retryData.session.expires_at,
      },
      user,
    });
  }

  const user = await buildAuthenticatedUser(student.user.authId);

  return ok({
    session: {
      accessToken: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token,
      expiresAt: signInData.session.expires_at,
    },
    user,
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
