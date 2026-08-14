/**
 * Document upload/verification schemas — 03_TechSpec §6, 07_Security_and_Privacy §4.
 *
 * The upload is a two-call handshake: `upload-url` validates the *claimed* file
 * before issuing a presigned PUT, then `complete` records metadata after the
 * bytes have gone straight to storage. Both calls validate MIME and size, because
 * the client controls what it claims and the second call is a separate request.
 */

import { z } from 'zod';
import { DOCUMENT_TYPES, VERIFICATION_STATUSES } from '@ims/shared-types';
import {
  fileSizeSchema,
  filenameSchema,
  mimeTypeSchema,
  optionalText,
  uuidSchema,
} from './common';

/** Extensions that must line up with the declared MIME type. */
const EXTENSION_BY_MIME: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/heic': ['heic'],
  'image/heif': ['heif', 'heic'],
};

/**
 * Rejects a `.exe` renamed to claim `application/pdf`, and a `.pdf` claiming to
 * be an image. 09_Test_Plan §6 requires unsupported types to be refused at both
 * client and server; this is the server-side half that does not need the bytes.
 */
function refineExtensionMatchesMime(
  value: { filename: string; mimeType: string },
  ctx: z.RefinementCtx,
): void {
  const extension = value.filename.split('.').pop()?.toLowerCase();
  if (!extension || extension === value.filename.toLowerCase()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The file must have an extension.',
      path: ['filename'],
    });
    return;
  }
  const allowed = EXTENSION_BY_MIME[value.mimeType];
  if (allowed && !allowed.includes(extension)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `A ${value.mimeType} file should not have a .${extension} extension.`,
      path: ['filename'],
    });
  }
}

export const uploadUrlSchema = z
  .object({
    filename: filenameSchema,
    mimeType: mimeTypeSchema,
    sizeBytes: fileSizeSchema,
    documentType: z.enum(DOCUMENT_TYPES, {
      errorMap: () => ({ message: 'Select what kind of document this is.' }),
    }),
  })
  .superRefine(refineExtensionMatchesMime);
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

/**
 * Storage keys are server-generated UUID paths. Accepting one back from the client
 * is safe only because the server re-checks that it issued this exact key to this
 * exact user before writing metadata.
 */
export const storageKeySchema = z
  .string()
  .trim()
  .min(8, { message: 'Invalid storage key.' })
  .max(256, { message: 'Invalid storage key.' })
  .regex(/^[A-Za-z0-9/_.-]+$/u, { message: 'Invalid storage key.' })
  .refine((value) => !value.includes('..'), { message: 'Invalid storage key.' });

export const completeUploadSchema = z
  .object({
    storageKey: storageKeySchema,
    filename: filenameSchema,
    mimeType: mimeTypeSchema,
    sizeBytes: fileSizeSchema,
    documentType: z.enum(DOCUMENT_TYPES),
    /** Optional SHA-256 hex digest for integrity (04_Database_Design: `checksum`). */
    checksum: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/iu, { message: 'Checksum must be a SHA-256 hex digest.' })
      .optional(),
    internshipId: uuidSchema.nullable().optional(),
  })
  .superRefine(refineExtensionMatchesMime);
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export const documentListQuerySchema = z.object({
  internshipId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
});
export type DocumentListQueryInput = z.infer<typeof documentListQuerySchema>;

export const verifyDocumentSchema = z.object({
  note: optionalText('Note', 500),
});
export type VerifyDocumentInput = z.infer<typeof verifyDocumentSchema>;

/**
 * A rejection reason is mandatory — the student receives it as a push
 * notification and needs to know what to re-upload (02_SRS §4).
 */
export const rejectDocumentSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(10, { message: 'Explain what is wrong so the student can correct it.' })
    .max(1_000, { message: 'Reason is too long.' }),
});
export type RejectDocumentInput = z.infer<typeof rejectDocumentSchema>;
