/**
 * File upload — the client half of the two-phase flow.
 *
 *   1. `POST /api/documents/upload-url` reserves a row and returns a signed URL
 *   2. the bytes go straight to Supabase Storage with a PUT
 *   3. `POST /api/documents/complete` confirms it and records the real size
 *
 * Step 2 bypasses our API entirely, which is why a 10 MB attachment does not tie up
 * a serverless function for the duration of the upload.
 *
 * We use expo-file-system's `uploadAsync` instead of fetch + blob for the PUT step.
 * React Native's `fetch().blob()` path goes through a base64 roundtrip that can
 * corrupt binary data and is slow for large files. `uploadAsync` sends raw bytes
 * directly from the file URI.
 */

import type { DocumentMeta, UploadUrlResponse } from '@ims/shared-types';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@ims/shared-types';
import { api, ApiError } from './client';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Checks a file before any network call, so an oversized or wrong-typed pick fails
 * instantly instead of after an upload round trip.
 *
 * Returns a message rather than throwing, because this feeds a form error.
 */
export function validateFile(file: PickedFile): string | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
    return 'Only PDF, JPG, PNG and HEIC files can be attached.';
  }
  if (file.size <= 0) {
    return 'That file appears to be empty.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That file is ${mb} MB. The limit is 10 MB.`;
  }
  return null;
}

/**
 * PUTs raw file bytes to a signed Supabase Storage URL.
 *
 * Uses fetch with a file URI blob. React Native's fetch handles file:// URIs
 * natively when passed as the body of a request.
 */
async function putToSignedUrl(fileUri: string, uploadUrl: string, mimeType: string): Promise<void> {
  // React Native fetch can handle file URIs via a blob created from the URI
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new ApiError({
      code: 'SERVER_ERROR',
      message: 'The file could not be uploaded. Check your connection and try again.',
      status: uploadResponse.status,
    });
  }
}

/**
 * Uploads one file and returns its confirmed metadata.
 *
 * If the PUT fails the reserved row is left behind; `complete` is never called, so
 * it stays unattached and out of every list. That is preferable to deleting it here:
 * a failed delete on top of a failed upload would leave no trace at all.
 */
export async function uploadFile(file: PickedFile): Promise<DocumentMeta> {
  const validationMessage = validateFile(file);
  if (validationMessage) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: validationMessage,
      status: 422,
    });
  }

  const reservation = await api.post<UploadUrlResponse>('/documents/upload-url', {
    filename: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.size,
  });

  await putToSignedUrl(file.uri, reservation.uploadUrl, file.mimeType);

  return api.post<DocumentMeta>('/documents/complete', {
    documentId: reservation.documentId,
  });
}

/**
 * The result of an anonymous pre-registration upload.
 * Unlike a regular DocumentMeta, there is no DB row yet — the document is
 * created inside student-register once the user account exists.
 */
export interface PreRegistrationUpload {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Uploads one file without authentication — used during student self-registration
 * before an account exists.
 *
 * Uses the dedicated `/api/auth/register-upload` endpoint which issues a signed
 * Supabase URL without creating a Document row. The student-register route creates
 * the Document row after the user account is created.
 */
export async function uploadFileAnonymous(file: PickedFile): Promise<PreRegistrationUpload> {
  const validationMessage = validateFile(file);
  if (validationMessage) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: validationMessage,
      status: 422,
    });
  }

  const reservation = await api.anonymous.post<{ uploadUrl: string; storageKey: string; expiresInSeconds: number }>(
    '/auth/register-upload',
    { filename: file.name, mimeType: file.mimeType, sizeBytes: file.size },
  );

  await putToSignedUrl(file.uri, reservation.uploadUrl, file.mimeType);

  return {
    storageKey: reservation.storageKey,
    filename: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.size,
  };
}
