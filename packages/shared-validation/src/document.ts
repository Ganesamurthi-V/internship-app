/**
 * Document upload schemas.
 *
 * Uploads are a two-step flow: the client asks for a signed URL, uploads the bytes
 * straight to Storage, then calls `/complete`. That keeps large request bodies off
 * the API server, and means a half-finished upload leaves a row marked incomplete
 * rather than a phantom file.
 */

import { z } from 'zod';
import { MAX_FILES_PER_SUBMISSION } from '@ims/shared-types';
import { fileSizeSchema, filenameSchema, mimeTypeSchema, uuidSchema } from './common';

export const uploadUrlSchema = z.object({
  filename: filenameSchema,
  mimeType: mimeTypeSchema,
  sizeBytes: fileSizeSchema,
});
export type UploadUrlInput = z.output<typeof uploadUrlSchema>;

export const completeUploadSchema = z.object({
  documentId: uuidSchema,
  /**
   * SHA-256 of the uploaded bytes. Optional because a client on a slow device may
   * skip hashing a large file; when present it is stored for integrity checking.
   */
  checksum: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/iu, { message: 'Checksum must be a SHA-256 hex digest.' })
    .nullable()
    .optional(),
  /**
   * Attach now, or leave null and let `POST /api/submissions` attach it. Null is
   * the normal case when a student picks files before answering.
   */
  submissionId: uuidSchema.nullable().optional(),
});
export type CompleteUploadInput = z.output<typeof completeUploadSchema>;

export const documentListQuerySchema = z.object({
  submissionId: uuidSchema.optional(),
});
export type DocumentListQueryInput = z.output<typeof documentListQuerySchema>;

/** Attaching already-uploaded files to a submission. */
export const attachDocumentsSchema = z.object({
  documentIds: z
    .array(uuidSchema)
    .min(1, { message: 'Choose at least one file.' })
    .max(MAX_FILES_PER_SUBMISSION, {
      message: `Attach ${MAX_FILES_PER_SUBMISSION} files or fewer.`,
    }),
});
export type AttachDocumentsInput = z.output<typeof attachDocumentsSchema>;
