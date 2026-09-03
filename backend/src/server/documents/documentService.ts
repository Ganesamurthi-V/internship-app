/**
 * File attachments.
 *
 * Two-phase upload: the client asks for a signed URL, PUTs the bytes straight to
 * Supabase Storage, then calls `/complete`. File content never passes through this
 * API server, and an abandoned upload leaves only a row with `uploadedAt` unset
 * rather than a phantom attachment.
 *
 * On completion the real object is stat'ed and the *actual* size and MIME type are
 * stored, not the client's claim. Without that, a client could promise a 1 KB PDF,
 * upload nothing, and leave a file that appears in the reviewer's list but cannot be
 * opened.
 */

import type { DocumentDownloadResponse, DocumentMeta } from '@ims/shared-types';
import { ALLOWED_MIME_TYPES, MAX_FILES_PER_SUBMISSION, UPLOAD_URL_TTL_SECONDS } from '@ims/shared-types';
import type { CompleteUploadInput, UploadUrlInput } from '@ims/shared-validation';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, validationError } from '@/lib/errors';
import { serializeDocument } from '@/lib/serialize';
import { recordAudit } from '@/lib/audit';
import {
  buildStorageKey,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  deleteObject,
  isInlineRenderable,
  statObject,
} from '@/lib/storage';
import type { AuthContext } from '@/lib/auth/context';

export interface IssuedUpload {
  documentId: string;
  uploadUrl: string;
  storagePath: string;
  expiresInSeconds: number;
}

/**
 * Reserves a document row and issues a signed upload URL.
 *
 * The row is written first so `/complete` has something to attach to and an
 * orphaned object can always be traced back. `uploadedAt` defaults to now, so
 * "completed" is really signalled by the size being confirmed.
 */
export async function issueUploadUrl(
  auth: AuthContext,
  input: UploadUrlInput,
): Promise<IssuedUpload> {
  // Guard the per-submission ceiling early: a student who has already attached the
  // maximum should be told before uploading bytes, not after.
  // Exclude registration documents (offer/joining letters stored on the student row)
  // so those don't count against the per-submission file limit.
  const studentRecord = await prisma.student.findFirst({
    where: { userId: auth.userId },
    select: { offerLetterDocId: true, joiningLetterDocId: true },
  });
  const registrationDocIds = [
    studentRecord?.offerLetterDocId,
    studentRecord?.joiningLetterDocId,
  ].filter(Boolean) as string[];

  const unattached = await prisma.document.count({
    where: {
      ownerUserId: auth.userId,
      submissionId: null,
      deletedAt: null,
      ...(registrationDocIds.length > 0 ? { id: { notIn: registrationDocIds } } : {}),
    },
  });

  if (unattached >= MAX_FILES_PER_SUBMISSION) {
    throw conflict(
      `You have ${unattached} files waiting to be attached. Submit or remove them first.`,
    );
  }

  const storageKey = buildStorageKey({
    ownerUserId: auth.userId,
    filename: input.filename,
  });

  const signed = await createSignedUploadUrl(storageKey);

  const document = await prisma.document.create({
    data: {
      ownerUserId: auth.userId,
      storageKey: signed.storageKey,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      // Provisional: replaced with the real size on completion.
      sizeBytes: input.sizeBytes,
    },
    select: { id: true },
  });

  return {
    documentId: document.id,
    uploadUrl: signed.uploadUrl,
    storagePath: signed.storageKey,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}

/**
 * Confirms an upload landed and records its true size and type.
 *
 * A missing object means the client never finished; the row is removed so it cannot
 * show up as an unopenable attachment.
 */
export async function completeUpload(
  auth: AuthContext,
  input: CompleteUploadInput,
): Promise<DocumentMeta> {
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, ownerUserId: auth.userId, deletedAt: null },
    select: { id: true, storageKey: true, originalFilename: true, mimeType: true },
  });

  if (!document) throw notFound('Upload not found.');

  const stat = await statObject(document.storageKey);

  if (!stat || stat.sizeBytes === 0) {
    // Nothing arrived. Drop the reservation rather than leave a broken attachment.
    await prisma.document.delete({ where: { id: document.id } });
    throw validationError('The file did not finish uploading. Try again.', {
      documentId: 'Upload incomplete.',
    });
  }

  // Trust the object's own MIME type over the client's claim, and re-check it
  // against the allow-list in case the bucket policy ever loosens.
  const actualMime = stat.mimeType ?? document.mimeType;
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(actualMime)) {
    await prisma.document.delete({ where: { id: document.id } });
    await deleteObject(document.storageKey);
    throw validationError('Only PDF, JPG, PNG and HEIC files are allowed.', {
      mimeType: 'Unsupported file type.',
    });
  }

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      sizeBytes: stat.sizeBytes,
      mimeType: actualMime,
      checksum: input.checksum ?? null,
      ...(input.submissionId !== undefined ? { submissionId: input.submissionId } : {}),
    },
    select: {
      id: true,
      submissionId: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  });

  await recordAudit({
    action: 'document_uploaded',
    entityType: 'document',
    entityId: updated.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { filename: document.originalFilename, sizeBytes: stat.sizeBytes },
  });

  return serializeDocument(updated);
}

/** The caller's files that are not yet attached to a submission. */
export async function listUnattached(auth: AuthContext): Promise<DocumentMeta[]> {
  const rows = await prisma.document.findMany({
    where: { ownerUserId: auth.userId, submissionId: null, deletedAt: null },
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      submissionId: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  });

  return rows.map(serializeDocument);
}

/**
 * Mints a short-lived download URL. Authorization happens before this is called.
 *
 * Pass `inline` when the URL is for an in-app or in-browser preview rather than a save;
 * see `createSignedDownloadUrl` for why that is not the default.
 */
export async function getDownloadUrl(
  auth: AuthContext,
  documentId: string,
  options?: { inline?: boolean },
): Promise<DocumentDownloadResponse> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: {
      id: true,
      storageKey: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
    },
  });

  if (!document) throw notFound('Document not found.');

  // A preview URL is only issued for types a viewer can safely render in place; anything
  // else falls back to an attachment, so asking for `inline` can never widen what a
  // caller is allowed to have rendered.
  const inline = options?.inline === true && isInlineRenderable(document.mimeType);

  const signed = await createSignedDownloadUrl(
    document.storageKey,
    inline ? { inline: true } : { downloadFilename: document.originalFilename },
  );

  await recordAudit({
    action: 'document_downloaded',
    entityType: 'document',
    entityId: document.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { filename: document.originalFilename, inline },
  });

  return {
    id: document.id,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    downloadUrl: signed.downloadUrl,
    expiresInSeconds: signed.expiresIn,
  };
}

/**
 * Soft-deletes then removes the object.
 *
 * That order matters: marking the row first means the file is unreachable through
 * the API immediately, so a storage failure leaves an orphaned object (a
 * housekeeping problem) rather than a live row pointing at nothing.
 */
export async function deleteDocument(
  auth: AuthContext,
  documentId: string,
  storageKey: string,
): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });

  await deleteObject(storageKey);

  await recordAudit({
    action: 'document_deleted',
    entityType: 'document',
    entityId: documentId,
    actorUserId: auth.userId,
    context: auth.request,
  });
}
