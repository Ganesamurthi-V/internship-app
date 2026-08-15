/**
 * Reusable Zod primitives.
 *
 * Each rule is defined exactly once here and composed by the feature schemas, so
 * the backend and the app's forms cannot disagree about what a valid mobile number
 * or answer is.
 *
 * Error messages are written for end users, because React Hook Form renders them
 * verbatim under the field.
 */

import { z } from 'zod';
import {
  ALLOWED_MIME_TYPES,
  DEFAULT_PAGE_SIZE,
  MAX_FILE_SIZE_BYTES,
  MAX_PAGE_SIZE,
  PASSWORD_MIN_LENGTH,
} from '@ims/shared-types';
import { isDateOnly, sanitizeText } from './calculations';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid({ message: 'Must be a valid identifier.' });

/**
 * Zod's built-in email check is pragmatic: it rejects the malformed addresses
 * users actually type without the pathological RFC 5322 regex.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'Email is required.' })
  .max(254, { message: 'Email is too long.' })
  .email({ message: 'Enter a valid email address.' })
  .transform((value) => value.toLowerCase());

/**
 * A 10-digit Indian mobile number or an E.164 international number.
 *
 * Spaces, hyphens and brackets are stripped first so a pasted number is not
 * rejected on cosmetics alone.
 */
export const mobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/gu, ''))
  .refine((value) => /^[6-9]\d{9}$/u.test(value) || /^\+[1-9]\d{7,14}$/u.test(value), {
    message: 'Enter a 10-digit mobile number or an international number starting with +.',
  });

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(128, { message: 'Password must be 128 characters or fewer.' })
  .regex(/[A-Z]/u, { message: 'Password must include at least one uppercase letter.' })
  .regex(/\d/u, { message: 'Password must include at least one number.' });

/** Sign-in checks presence only — applying the strength policy would leak it. */
export const loginPasswordSchema = z.string().min(1, { message: 'Password is required.' });

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const dateOnlySchema = z
  .string()
  .trim()
  .refine(isDateOnly, { message: 'Enter a valid date in YYYY-MM-DD format.' });

export const timestampSchema = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 timestamp.' });

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

/**
 * A sanitised free-text field with character bounds.
 *
 * Sanitisation runs before validation so a string of control characters cannot
 * satisfy a minimum length and then be stored as empty.
 */
export function textField(options: {
  label: string;
  min?: number;
  max?: number;
}) {
  const { label, min = 0, max = 10_000 } = options;
  return z
    .string()
    .transform(sanitizeText)
    .superRefine((value, ctx) => {
      if (value.length > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be ${max} characters or fewer. You have ${value.length}.`,
        });
        return;
      }
      if (value.length < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            min === 1
              ? `${label} is required.`
              : `${label} must be at least ${min} characters.`,
        });
      }
    });
}

/**
 * Optional free text that normalises blank input to null, so the database holds
 * NULL rather than an empty string for "not provided".
 */
export function optionalText(label: string, maxChars = 2_000) {
  return z
    .string()
    .transform(sanitizeText)
    .superRefine((value, ctx) => {
      if (value.length > maxChars) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is too long.` });
      }
    })
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const mimeTypeSchema = z.enum(ALLOWED_MIME_TYPES, {
  errorMap: () => ({ message: 'Only PDF, JPG, PNG and HEIC files are allowed.' }),
});

export const fileSizeSchema = z
  .number()
  .int({ message: 'File size must be a whole number of bytes.' })
  .positive({ message: 'File appears to be empty.' })
  .max(MAX_FILE_SIZE_BYTES, { message: 'File must be 10 MB or smaller.' });

/**
 * Filenames are display-only — the storage key is a random UUID. Path separators
 * and traversal sequences are stripped anyway, so a name like
 * `../../etc/passwd.pdf` cannot leak into a log or a Content-Disposition header.
 */
export const filenameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Filename is required.' })
  .max(255, { message: 'Filename is too long.' })
  .transform((value) => sanitizeText(value).replace(/[/\\]/gu, '_').replace(/\.{2,}/gu, '.'));

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/**
 * Coerces because these arrive as query-string values. `pageSize` is capped so a
 * client cannot request the whole table in one page.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PaginationQueryOutput = z.output<typeof paginationQuerySchema>;

export const dateRangeQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The "from" date must be on or before the "to" date.',
    path: ['from'],
  });

/**
 * Boolean coercion for query strings, where `?activeOnly=false` arrives as the
 * string "false" and would otherwise be truthy.
 */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'));
