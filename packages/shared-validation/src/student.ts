/**
 * Student profile, department and user administration schemas.
 */

import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '@ims/shared-types';
import { emailSchema, mobileSchema, optionalText, passwordSchema, uuidSchema } from './common';

const nameSchema = z
  .string()
  .trim()
  .min(2, { message: 'Enter the full name.' })
  .max(120, { message: 'Name is too long.' });

/**
 * The register number is the master key for a student record, so it is normalised
 * to uppercase. Without that, `21cs101` and `21CS101` become two students and the
 * unique constraint does not save you.
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
  year: z.coerce
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
export type CreateStudentInput = z.output<typeof createStudentSchema>;

/**
 * The register number is deliberately not updatable: it is the institutional
 * identifier, and changing it would orphan the submission history attached to it.
 */
export const updateStudentProfileSchema = createStudentSchema
  .omit({ registerNumber: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateStudentProfileInput = z.output<typeof updateStudentProfileSchema>;

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, { message: 'Department name is required.' }).max(160),
  institution: z.string().trim().min(2).max(200).optional(),
});
export type CreateDepartmentInput = z.output<typeof createDepartmentSchema>;

// ---------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(USER_ROLES),
  /** Required when role is `student` so the profile row is created alongside. */
  student: createStudentSchema.optional(),
  name: nameSchema.optional(),
});
export type CreateUserInput = z.output<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    /** Recorded in the audit log — a role change is high-sensitivity. */
    reason: optionalText('Reason', 500),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Provide a role or a status to change.',
  });
export type UpdateUserInput = z.output<typeof updateUserSchema>;
