/**
 * Reusable Zod primitives.
 *
 * Every rule in the 02_SRS §3 validation table is defined exactly once here and
 * composed by the feature schemas, so the backend and the mobile forms cannot
 * disagree about what a valid mobile number or rating is.
 *
 * Error messages are written for end users, because React Hook Form renders them
 * verbatim under the field.
 */

import { z } from 'zod';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_RATING,
  MIN_RATING,
  PASSWORD_MIN_LENGTH,
} from '@ims/shared-types';
import { countWords, isDateOnly, isTimeOnly, sanitizeText } from './calculations';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid({ message: 'Must be a valid identifier.' });

/**
 * RFC 5322 in spirit — Zod's built-in email check is pragmatic and rejects the
 * malformed addresses users actually type, without the pathological regex.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'Email is required.' })
  .max(254, { message: 'Email is too long.' })
  .email({ message: 'Enter a valid email address.' })
  .transform((value) => value.toLowerCase());

/**
 * 02_SRS §3 — "10-digit Indian mobile or E.164".
 *
 * Accepts `9876543210`, `+919876543210`, and other E.164 forms. Spaces, hyphens
 * and brackets are stripped first so pasted numbers are not rejected on
 * cosmetics alone.
 */
export const mobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/gu, ''))
  .refine((value) => /^[6-9]\d{9}$/u.test(value) || /^\+[1-9]\d{7,14}$/u.test(value), {
    message: 'Enter a 10-digit mobile number or an international number starting with +.',
  });

// ---------------------------------------------------------------------------
// Passwords — 07_Security_and_Privacy §5
// ---------------------------------------------------------------------------

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(128, { message: 'Password must be 128 characters or fewer.' })
  .regex(/[A-Z]/u, { message: 'Password must include at least one uppercase letter.' })
  .regex(/\d/u, { message: 'Password must include at least one number.' });

/** Login must not apply the strength policy — it only checks presence. */
export const loginPasswordSchema = z.string().min(1, { message: 'Password is required.' });

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

export const dateOnlySchema = z
  .string()
  .trim()
  .refine(isDateOnly, { message: 'Enter a valid date in YYYY-MM-DD format.' });

export const timeOnlySchema = z
  .string()
  .trim()
  .refine(isTimeOnly, { message: 'Enter a valid time in HH:MM format.' });

export const timestampSchema = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 timestamp.' });

// ---------------------------------------------------------------------------
// Ratings — integer 1–5
// ---------------------------------------------------------------------------

export const ratingSchema = z
  .number({ invalid_type_error: 'Select a rating.' })
  .int({ message: 'Rating must be a whole number.' })
  .min(MIN_RATING, { message: `Rating must be between ${MIN_RATING} and ${MAX_RATING}.` })
  .max(MAX_RATING, { message: `Rating must be between ${MIN_RATING} and ${MAX_RATING}.` });

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

/**
 * Builds a sanitised free-text field with an optional word cap.
 *
 * Sanitisation runs before validation so a string of control characters cannot
 * satisfy a `min(1)` check and then be stored as empty.
 */
export function textField(options: {
  maxWords?: number;
  maxChars?: number;
  minWords?: number;
  label: string;
}) {
  const { maxWords, maxChars = 10_000, minWords, label } = options;
  return z
    .string()
    .transform(sanitizeText)
    .superRefine((value, ctx) => {
      if (value.length > maxChars) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is too long.` });
        // Skip the word checks — the char message is the actionable one.
        return;
      }
      const words = countWords(value);
      if (minWords !== undefined && words < minWords) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            minWords === 1 ? `${label} is required.` : `${label} must be at least ${minWords} words.`,
        });
      }
      if (maxWords !== undefined && words > maxWords) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be ${maxWords} words or fewer. You have ${words}.`,
        });
      }
    });
}

/**
 * Optional free text that normalises blank input to null, so the database holds
 * NULL rather than an empty string for "not answered".
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

/**
 * Technology / skill tag arrays.
 *
 * Tags are trimmed, de-duplicated case-insensitively (keeping the first spelling
 * the student used), and capped so a runaway paste cannot bloat a row.
 */
export const tagArraySchema = z
  .array(z.string().transform(sanitizeText))
  .max(50, { message: 'Add 50 tags or fewer.' })
  .transform((tags) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tag of tags) {
      const normalised = tag.slice(0, 60);
      if (normalised.length === 0) continue;
      const key = normalised.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalised);
    }
    return result;
  })
  .default([]);

// ---------------------------------------------------------------------------
// Files — 02_SRS §3, 07_Security_and_Privacy §4
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
 * Filenames are used for display only — the storage key is a random UUID
 * (07_Security_and_Privacy §4). Path separators and traversal sequences are
 * stripped anyway so a name like `../../etc/passwd.pdf` cannot leak into logs or
 * a Content-Disposition header.
 */
export const filenameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Filename is required.' })
  .max(255, { message: 'Filename is too long.' })
  .transform((value) => sanitizeText(value).replace(/[/\\]/gu, '_').replace(/\.{2,}/gu, '.'));

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Coerces because these arrive as query-string values. `pageSize` is capped so a
 * client cannot request the entire table in one page.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PaginationQueryOutput = z.output<typeof paginationQuerySchema>;

// ---------------------------------------------------------------------------
// Date range query
// ---------------------------------------------------------------------------

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
 * Boolean coercion for query strings, where `?verified=false` arrives as the
 * string "false" and would otherwise be truthy.
 */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : value === 'true' || value === '1',
  );
