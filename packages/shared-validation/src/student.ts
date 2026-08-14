/**
 * Student profile, department, organisation and mentor schemas.
 * 05_API_Spec "Students"; 01_PRD §4.1 registration fields.
 */

import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '@ims/shared-types';
import {
  dateOnlySchema,
  emailSchema,
  mobileSchema,
  optionalText,
  paginationQuerySchema,
  passwordSchema,
  uuidSchema,
} from './common';

const nameSchema = z
  .string()
  .trim()
  .min(2, { message: 'Enter the full name.' })
  .max(120, { message: 'Name is too long.' });

/**
 * Register number is the master key for a student record (01_PRD §1), so it is
 * normalised to uppercase to prevent `21cs101` and `21CS101` becoming two
 * students.
 */
export const registerNumberSchema = z
  .string()
  .trim()
  .min(3, { message: 'Register number is required.' })
  .max(32, { message: 'Register number is too long.' })
  .regex(/^[A-Za-z0-9/-]+$/u, {
    message: 'Register number may contain only letters, numbers, hyphens and slashes.',
  })
  .transform((value) => value.toUpperCase());

export const createStudentSchema = z.object({
  registerNumber: registerNumberSchema,
  name: nameSchema,
  programme: z.string().trim().min(2, { message: 'Programme is required.' }).max(120),
  departmentId: uuidSchema.nullable().optional(),
  year: z
    .number()
    .int({ message: 'Year must be a whole number.' })
    .min(1, { message: 'Year must be between 1 and 5.' })
    .max(5, { message: 'Year must be between 1 and 5.' })
    .nullable()
    .optional(),
  section: z.string().trim().max(8).nullable().optional(),
  studentEmail: emailSchema,
  mobile: mobileSchema.nullable().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

/**
 * Register number is intentionally not updatable by the student — it is the
 * institutional identifier and changing it would orphan evidence records.
 */
export const updateStudentProfileSchema = createStudentSchema.omit({ registerNumber: true }).partial();
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;

export const studentListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  departmentId: uuidSchema.optional(),
  status: z.string().trim().max(32).optional(),
  missingLogOn: dateOnlySchema.optional(),
});
export type StudentListQueryInput = z.infer<typeof studentListQuerySchema>;

// ---------------------------------------------------------------------------
// Departments & organisations (admin-managed)
// ---------------------------------------------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, { message: 'Department name is required.' }).max(160),
  institution: z.string().trim().min(2).max(200).optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const createOrganisationSchema = z.object({
  name: z.string().trim().min(2, { message: 'Organisation name is required.' }).max(200),
  location: z.string().trim().max(200).nullable().optional(),
});
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

export const updateOrganisationSchema = createOrganisationSchema.partial();
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

// ---------------------------------------------------------------------------
// Mentors
// ---------------------------------------------------------------------------

/**
 * Email is optional in the database but required to send an invite link, which is
 * the recommended mentor access path (08_Implementation_Plan Phase 0). Callers
 * that need an invite must therefore supply it.
 */
export const createMentorSchema = z.object({
  name: nameSchema,
  designation: z.string().trim().max(120).nullable().optional(),
  email: emailSchema.nullable().optional(),
  contact: mobileSchema.nullable().optional(),
  organisationId: uuidSchema.nullable().optional(),
});
export type CreateMentorInput = z.infer<typeof createMentorSchema>;

export const updateMentorSchema = createMentorSchema.partial();
export type UpdateMentorInput = z.infer<typeof updateMentorSchema>;

export const createMentorInviteSchema = z.object({
  mentorId: uuidSchema,
  /** Invite validity in days; defaults to 14. */
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
export type CreateMentorInviteInput = z.infer<typeof createMentorInviteSchema>;

/** Mentor claims an invite and sets a password to create their account. */
export const acceptMentorInviteSchema = z.object({
  token: z.string().min(16, { message: 'Invite link is not valid.' }),
  password: passwordSchema,
});
export type AcceptMentorInviteInput = z.infer<typeof acceptMentorInviteSchema>;

// ---------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(USER_ROLES),
  /** Required when role === 'student' so the profile row can be created too. */
  student: createStudentSchema.optional(),
  name: nameSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  /** Recorded in the audit log — role changes are High sensitivity. */
  reason: optionalText('Reason', 500),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
