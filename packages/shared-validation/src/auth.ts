/**
 * Auth schemas.
 *
 * Faculty sign-in uses Supabase Auth directly (email + password).
 * Student sign-in uses register number + mobile, validated by the backend which
 * then creates/returns a Supabase session.
 */

import { z } from 'zod';
import { CLIENT_PLATFORMS, INTERNSHIP_DOMAINS, INTERNSHIP_MODES } from '@ims/shared-types';
import { emailSchema, loginPasswordSchema, mobileSchema, passwordSchema, uuidSchema } from './common';
import { registerNumberSchema, workingDaysSchema } from './student';

// ---------------------------------------------------------------------------
// Faculty login (email + password via Supabase client)
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Student login (register number + mobile)
// ---------------------------------------------------------------------------

export const studentLoginSchema = z.object({
  registerNumber: registerNumberSchema,
  mobile: z
    .string()
    .trim()
    .min(1, { message: 'Mobile number is required.' })
    .transform((value) => value.replace(/[\s()-]/gu, '')),
});
export type StudentLoginInput = z.output<typeof studentLoginSchema>;

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------

export const studentRegisterSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter your full name.' }).max(120),
  registerNumber: registerNumberSchema,
  programme: z.string().trim().min(2, { message: 'Programme is required.' }).max(120),
  departmentId: uuidSchema.nullable().optional(),
  year: z.coerce
    .number()
    .int()
    .min(1, { message: 'Year must be between 1 and 5.' })
    .max(5, { message: 'Year must be between 1 and 5.' })
    .nullable()
    .optional(),
  section: z.string().trim().max(8).nullable().optional(),
  studentEmail: emailSchema,
  mobile: mobileSchema,

  /**
   * The weekdays this student's placement runs on, chosen on the registration form.
   *
   * Optional so an older build of the app can still register a student — the column
   * default (Mon-Fri) applies. Sending it is strongly preferred: attendance is measured
   * against these days, and a six-day placement left on the default would be marked
   * absent for every Saturday of the internship.
   */
  workingDays: workingDaysSchema.optional(),

  // Internship details
  organisationName: z.string().trim().min(2, { message: 'Organisation name is required.' }).max(200),
  organisationLocation: z.string().trim().max(200).nullable().optional(),
  internshipDomain: z.string().trim().max(100).nullable().optional(),
  internshipMode: z.enum(INTERNSHIP_MODES).nullable().optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, { message: 'Enter a valid date (YYYY-MM-DD).' }).nullable().optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, { message: 'Enter a valid date (YYYY-MM-DD).' }).nullable().optional(),
  durationDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  workingHoursPerDay: z.coerce.number().int().min(1).max(24).nullable().optional(),

  // Mentor details
  mentorName: z.string().trim().max(120).nullable().optional(),
  mentorDesignation: z.string().trim().max(120).nullable().optional(),
  mentorContact: z.string().trim().max(200).nullable().optional(),
  facultyCoordinator: z.string().trim().max(120).nullable().optional(),

  // Document uploads — two mutually-exclusive ways to pass document references:
  //   1. offerLetterDocId / joiningLetterDocId: UUIDs of already-confirmed Document
  //      rows (used by authenticated upload flow).
  //   2. offerLetterStorageKey / joiningLetterStorageKey: raw storage paths issued
  //      by /api/auth/register-upload (used by the anonymous pre-registration flow).
  //      student-register creates the Document rows after the user account exists.
  offerLetterDocId: uuidSchema.nullable().optional(),
  joiningLetterDocId: uuidSchema.nullable().optional(),
  offerLetterStorageKey: z.string().trim().min(1).max(500).nullable().optional(),
  joiningLetterStorageKey: z.string().trim().min(1).max(500).nullable().optional(),
  // Metadata needed to create the Document rows from storage keys.
  offerLetterFilename: z.string().trim().max(500).nullable().optional(),
  joiningLetterFilename: z.string().trim().max(500).nullable().optional(),
  offerLetterMimeType: z.string().trim().max(100).nullable().optional(),
  joiningLetterMimeType: z.string().trim().max(100).nullable().optional(),
  offerLetterSizeBytes: z.coerce.number().int().nullable().optional(),
  joiningLetterSizeBytes: z.coerce.number().int().nullable().optional(),
});
export type StudentRegisterInput = z.output<typeof studentRegisterSchema>;

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    /** The recovery access token from the emailed link. */
    accessToken: z.string().min(1, { message: 'Reset token is required.' }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Client context headers
// ---------------------------------------------------------------------------

/**
 * Client context headers, recorded on audit rows.
 * Parsed leniently with `.catch()`: a missing or malformed header is metadata, and
 * losing it must never fail the request it describes.
 */
export const clientContextSchema = z.object({
  clientPlatform: z.enum(CLIENT_PLATFORMS).optional().catch(undefined),
  clientVersion: z.string().trim().max(32).optional().catch(undefined),
});
export type ClientContextInput = z.infer<typeof clientContextSchema>;
