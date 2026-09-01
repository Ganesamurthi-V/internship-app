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
import { recordAudit } from '@/lib/audit';
import { getRequestContext } from '@/lib/http';
import { statObject } from '@/lib/storage';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, studentRegisterSchema);

  // Check register number uniqueness
  const existing = await prisma.student.findUnique({
    where: { registerNumber: input.registerNumber },
    select: { id: true },
  });

  if (existing) {
    throw conflict('This register number is already registered. Use Student Login instead.', {
      registerNumber: 'This register number is already registered.',
    });
  }

  // Check email uniqueness
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.studentEmail },
    select: { id: true },
  });

  if (existingEmail) {
    throw conflict('This email is already in use.', {
      studentEmail: 'This email is already registered.',
    });
  }

  // Mobile number (stripped) becomes the Supabase password
  const mobile = input.mobile.replace(/[\s()-]/gu, '');

  // Create Supabase Auth user
  let { data: authData, error: authError } = await supabaseAdmin().auth.admin.createUser({
    email: input.studentEmail,
    password: mobile,
    email_confirm: true,
    user_metadata: { role: 'student', name: input.name },
  });

  // Supabase Auth lives in `auth.users`, a different table from `public.users`.
  // Deleting the app rows (or a half-failed earlier attempt) leaves the auth
  // account behind, which would otherwise lock that email out forever.
  //
  // We already proved above that no app user owns this email, so any auth account
  // still holding it is unreferenced leftover data. Reclaim it and retry once.
  if (authError?.message?.includes('already been registered')) {
    const orphanAuthId = await findAuthUserIdByEmail(input.studentEmail);

    if (!orphanAuthId) {
      // Supabase says taken but we cannot find it — do not guess, surface it.
      throw conflict('This email is already registered with the authentication service.', {
        studentEmail: 'This email is already registered.',
      });
    }

    const { error: deleteError } = await supabaseAdmin().auth.admin.deleteUser(orphanAuthId);
    if (deleteError) {
      throw serverError(`Could not reclaim the previous account for this email: ${deleteError.message}`);
    }

    ({ data: authData, error: authError } = await supabaseAdmin().auth.admin.createUser({
      email: input.studentEmail,
      password: mobile,
      email_confirm: true,
      user_metadata: { role: 'student', name: input.name },
    }));
  }

  if (authError || !authData?.user) {
    throw serverError(`Could not create account: ${authError?.message ?? 'unknown error'}`);
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
          status: 'pending',
          name: input.name,
        },
        select: { id: true },
      });

      // If the client used the anonymous pre-registration upload flow, the storage
      // keys come in as separate fields. Create the Document rows now that we have
      // a real userId, then resolve the doc IDs for the student record.
      let resolvedOfferDocId = input.offerLetterDocId ?? null;
      let resolvedJoinDocId  = input.joiningLetterDocId ?? null;

      if (input.offerLetterStorageKey && !resolvedOfferDocId) {
        let size = input.offerLetterSizeBytes ?? 0;
        let mime = input.offerLetterMimeType ?? 'application/pdf';
        try {
          const stat = await statObject(input.offerLetterStorageKey);
          if (stat) {
            size = stat.sizeBytes || size;
            mime = stat.mimeType || mime;
          }
        } catch {
          // Fall back to client metadata
        }
        const doc = await tx.document.create({
          data: {
            ownerUserId: user.id,
            storageKey: input.offerLetterStorageKey,
            originalFilename: input.offerLetterFilename ?? 'offer-letter.pdf',
            mimeType: mime,
            sizeBytes: size,
          },
          select: { id: true },
        });
        resolvedOfferDocId = doc.id;
      }

      if (input.joiningLetterStorageKey && !resolvedJoinDocId) {
        let size = input.joiningLetterSizeBytes ?? 0;
        let mime = input.joiningLetterMimeType ?? 'application/pdf';
        try {
          const stat = await statObject(input.joiningLetterStorageKey);
          if (stat) {
            size = stat.sizeBytes || size;
            mime = stat.mimeType || mime;
          }
        } catch {
          // Fall back to client metadata
        }
        const doc = await tx.document.create({
          data: {
            ownerUserId: user.id,
            storageKey: input.joiningLetterStorageKey,
            originalFilename: input.joiningLetterFilename ?? 'joining-letter.pdf',
            mimeType: mime,
            sizeBytes: size,
          },
          select: { id: true },
        });
        resolvedJoinDocId = doc.id;
      }

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
          // Omitted by an older build of the app, in which case the column default
          // (Mon-Fri) applies rather than an empty working week.
          ...(input.workingDays ? { workingDays: input.workingDays } : {}),
          mentorName: input.mentorName ?? null,
          mentorDesignation: input.mentorDesignation ?? null,
          mentorContact: input.mentorContact ?? null,
          facultyCoordinator: input.facultyCoordinator ?? null,
          offerLetterDocId: resolvedOfferDocId,
          joiningLetterDocId: resolvedJoinDocId,
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

  // Account created with status 'pending'. Do NOT sign in — faculty must approve first.
  return created({
    message: 'Account created successfully! Your profile is pending faculty approval. You will be able to log in once your department faculty approves your account.',
    registerNumber: input.registerNumber,
    status: 'pending',
  });
});

/**
 * Finds a Supabase Auth user id by email.
 *
 * The admin API has no get-by-email, so this walks the paginated listing. Capped at
 * 10 pages (2000 accounts) so a large project cannot turn one registration into an
 * unbounded scan; a single college's roster sits well inside that.
 */
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const needle = email.toLowerCase();
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 200 });
    if (error || data.users.length === 0) return null;

    const match = data.users.find((u) => u.email?.toLowerCase() === needle);
    if (match) return match.id;

    if (data.users.length < 200) return null;
  }

  return null;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
