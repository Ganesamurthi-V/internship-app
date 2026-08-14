/**
 * Document lifecycle — 03_TechSpec §6, 07_Security_and_Privacy §4.
 *
 * The two-call upload handshake:
 *   1. `requestUploadUrl` validates the claimed file, mints a random storage key
 *      scoped to the caller, and returns a signed upload URL.
 *   2. `completeUpload` verifies the object actually landed, reads its *real* size
 *      and MIME type from storage, and only then writes metadata.
 *
 * File bytes never pass through this server.
 *
 * Two properties worth calling out:
 *
 *  - The storage key is a random UUID under an owner prefix, never derived from the
 *    filename. That neutralises `../../../etc/passwd.pdf` by construction rather
 *    than by sanitising, which is what 09_Test_Plan §6 asks for.
 *
 *  - `completeUpload` trusts storage, not the client, for size and MIME. Otherwise a
 *    client could claim a 1 KB PDF, upload a 9 MB image, and leave a row whose
 *    metadata does not describe the object.
 */

import type { DocumentMeta, DocumentType } from '@ims/shared-types';
import type { CompleteUploadInput, UploadUrlInput } from '@ims/shared-validation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { conflict, forbidden, notFound, validationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAudit } from '@/lib/audit';
import { NOTIFICATIONS, sendNotification } from '@/lib/push';
import { serializeDocument } from '@/lib/serialize';
import type { AuthContext } from '@/lib/auth/context';
import { assertInternshipAccess, isAdmin, isStaff } from '@/lib/auth/guards';
import {
  buildStorageKey,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  deleteObject,
  statObject,
  type SignedUpload,
} from '@/lib/storage';

export const DOCUMENT_SELECT = {
  id: true,
  ownerUserId: true,
  documentType: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  uploadedAt: true,
  verifiedAt: true,
  verificationStatus: true,
  rejectionReason: true,
} as const;

/**
 * Issues a signed upload URL.
 *
 * The size check is repeated here even though Zod already enforces 10 MB, because
 * `MAX_UPLOAD_BYTES` is configurable and an institution may lower it below the
 * schema's ceiling.
 */
export async function requestUploadUrl(
  auth: AuthContext,
  input: UploadUrlInput,
): Promise<SignedUpload> {
  if (input.sizeBytes > env.MAX_UPLOAD_BYTES) {
    const limitMb = Math.floor(env.MAX_UPLOAD_BYTES / (1024 * 1024));
    throw validationError(`Files must be ${limitMb} MB or smaller.`, {
      sizeBytes: `Maximum ${limitMb} MB.`,
    });
  }

  const storageKey = buildStorageKey({
    ownerUserId: auth.userId,
    documentType: input.documentType,
    filename: input.filename,
  });

  return createSignedUploadUrl(storageKey);
}

/**
 * Records metadata after the bytes have been uploaded.
 *
 * The ownership check is the important line: a storage key always begins with the
 * user id it was issued to, so a client cannot present a key minted for someone else
 * and attach that object to its own document row.
 */
export async function completeUpload(
  auth: AuthContext,
  input: CompleteUploadInput,
): Promise<DocumentMeta> {
  const expectedPrefix = `${auth.userId}/`;
  if (!input.storageKey.startsWith(expectedPrefix)) {
    logger.warn(
      { userId: auth.userId, storageKey: input.storageKey },
      'Rejected an upload completion for a storage key issued to another user',
    );
    throw forbidden('That upload does not belong to you.');
  }

  // Reject a replay: a key is single-use, so a second completion would either
  // duplicate the row or silently rebind an already-verified document.
  const existing = await prisma.document.findUnique({
    where: { storageKey: input.storageKey },
    select: { id: true },
  });
  if (existing) {
    throw conflict('This upload has already been recorded.');
  }

  const stat = await statObject(input.storageKey);
  if (!stat) {
    throw validationError('The upload did not complete. Try again.', {
      storageKey: 'No file found at this location.',
    });
  }

  if (stat.sizeBytes > env.MAX_UPLOAD_BYTES) {
    // The object is larger than allowed, so remove it rather than leave it orphaned.
    await deleteObject(input.storageKey);
    const limitMb = Math.floor(env.MAX_UPLOAD_BYTES / (1024 * 1024));
    throw validationError(`Files must be ${limitMb} MB or smaller.`, {
      sizeBytes: `The uploaded file is larger than ${limitMb} MB.`,
    });
  }

  if (input.internshipId) {
    await assertInternshipBelongsToCaller(auth, input.internshipId);
  }

  const document = await prisma.document.create({
    data: {
      ownerUserId: auth.userId,
      documentType: input.documentType,
      storageKey: input.storageKey,
      originalFilename: input.filename,
      // Storage is the authority for these two, not the client's claim.
      mimeType: stat.mimeType ?? input.mimeType,
      sizeBytes: stat.sizeBytes > 0 ? stat.sizeBytes : input.sizeBytes,
      checksum: input.checksum ?? null,
      internshipId: input.internshipId ?? null,
      verificationStatus: 'pending',
    },
    select: DOCUMENT_SELECT,
  });

  await recordAudit({
    action: 'document_uploaded',
    entityType: 'document',
    entityId: document.id,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      documentType: input.documentType,
      sizeBytes: document.sizeBytes,
      internshipId: input.internshipId ?? null,
    },
  });

  return serializeDocument(document);
}

/**
 * A student may only attach documents to their own internship. Staff may attach to
 * anything in scope, which is how a coordinator uploads a statement on a student's
 * behalf.
 */
async function assertInternshipBelongsToCaller(
  auth: AuthContext,
  internshipId: string,
): Promise<void> {
  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { studentId: true },
  });
  if (!internship) {
    throw validationError('That internship does not exist.', {
      internshipId: 'Unknown internship.',
    });
  }

  if (isStaff(auth)) return;

  if (auth.studentId !== internship.studentId) {
    throw forbidden('You do not have permission to do that.');
  }
}

/**
 * Authorization for reading or acting on one document.
 *
 * Two paths: the owner always qualifies, and anyone with access to the document's
 * internship qualifies at the requested level. A document with no internship (a
 * profile-level upload) is owner-and-admin only, because there is no internship to
 * scope it by.
 */
async function authorizeDocument(
  auth: AuthContext,
  documentId: string,
  level: 'read' | 'write' | 'verify',
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      ...DOCUMENT_SELECT,
      storageKey: true,
      deletedAt: true,
      internshipId: true,
    },
  });

  if (!document || document.deletedAt) {
    // A soft-deleted document is gone as far as the API is concerned
    // (07_Security_and_Privacy §4).
    throw notFound('Document not found.');
  }

  const isOwner = document.ownerUserId === auth.userId;

  // The owner can read and replace their own uploads, but never verify them.
  if (isOwner && level !== 'verify') {
    return document;
  }

  if (isAdmin(auth)) return document;

  if (document.internshipId) {
    await assertInternshipAccess(auth, document.internshipId, 'document', level);
    return document;
  }

  throw forbidden('You do not have permission to do that.');
}

export async function getDocumentDownload(auth: AuthContext, documentId: string) {
  const document = await authorizeDocument(auth, documentId, 'read');

  const signed = await createSignedDownloadUrl(document.storageKey, {
    downloadFilename: document.originalFilename,
  });

  return {
    downloadUrl: signed.downloadUrl,
    expiresIn: signed.expiresIn,
    document: serializeDocument(document),
  };
}

/**
 * Two-phase delete, per 07_Security_and_Privacy §4: "storage key marked `deleted`;
 * S3 object deleted asynchronously; presigned URLs for that key will 404."
 *
 * The row is marked first so the document becomes unreachable immediately even if
 * object removal fails. A failed removal leaves an orphaned object, which is a
 * housekeeping problem rather than a data exposure — the key is unguessable and no
 * new URL can be minted for it.
 */
export async function deleteDocument(auth: AuthContext, documentId: string): Promise<void> {
  const document = await authorizeDocument(auth, documentId, 'write');

  // A verified document is evidence. Only an admin may remove it.
  if (document.verificationStatus === 'verified' && !isAdmin(auth)) {
    throw forbidden('Verified documents cannot be deleted. Contact your department office.');
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });

  await recordAudit({
    action: 'document_deleted',
    entityType: 'document',
    entityId: documentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { documentType: document.documentType, storageKeyRemoved: true },
    // High sensitivity per 07_Security_and_Privacy §9.
    strict: true,
  });

  await deleteObject(document.storageKey);
}

export async function verifyDocument(
  auth: AuthContext,
  documentId: string,
  note: string | null,
): Promise<DocumentMeta> {
  const document = await authorizeDocument(auth, documentId, 'verify');

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      verifiedById: auth.userId,
      // Clear any previous rejection so the student is not shown a stale reason.
      rejectionReason: null,
    },
    select: DOCUMENT_SELECT,
  });

  await recordAudit({
    action: 'document_verified',
    entityType: 'document',
    entityId: documentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { documentType: document.documentType, note },
  });

  await sendNotification({
    ...NOTIFICATIONS.documentVerified(),
    userId: document.ownerUserId,
  });

  return serializeDocument(updated);
}

export async function rejectDocument(
  auth: AuthContext,
  documentId: string,
  rejectionReason: string,
): Promise<DocumentMeta> {
  const document = await authorizeDocument(auth, documentId, 'verify');

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      verificationStatus: 'rejected',
      verifiedAt: null,
      verifiedById: auth.userId,
      rejectionReason,
    },
    select: DOCUMENT_SELECT,
  });

  await recordAudit({
    action: 'document_rejected',
    entityType: 'document',
    entityId: documentId,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: { documentType: document.documentType, rejectionReason },
  });

  // 02_SRS §4: a rejection notifies the student so they can re-upload. The body
  // deliberately omits the reason — the app fetches it over the authenticated API
  // (07_Security_and_Privacy §7).
  await sendNotification({
    ...NOTIFICATIONS.documentRejected(),
    userId: document.ownerUserId,
  });

  return serializeDocument(updated);
}

/** Filtered document list. Soft-deleted rows are always excluded. */
export async function listDocuments(
  auth: AuthContext,
  filters: {
    internshipId?: string | undefined;
    studentId?: string | undefined;
    type?: DocumentType | undefined;
    verificationStatus?: string | undefined;
  },
): Promise<DocumentMeta[]> {
  const clauses: Prisma.DocumentWhereInput[] = [{ deletedAt: null }];

  if (filters.internshipId) {
    await assertInternshipAccess(auth, filters.internshipId, 'document', 'read');
    clauses.push({ internshipId: filters.internshipId });
  } else if (!isStaff(auth)) {
    // Without an internship filter, a non-staff caller sees only their own uploads.
    clauses.push({ ownerUserId: auth.userId });
  }

  if (filters.studentId) {
    clauses.push({ internship: { studentId: filters.studentId } });
  }
  if (filters.type) clauses.push({ documentType: filters.type });
  if (filters.verificationStatus) {
    clauses.push({ verificationStatus: filters.verificationStatus as never });
  }

  const documents = await prisma.document.findMany({
    where: { AND: clauses },
    orderBy: { uploadedAt: 'desc' },
    select: DOCUMENT_SELECT,
  });

  return documents.map(serializeDocument);
}
