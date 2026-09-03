/**
 * Document storage on Supabase Storage.
 *
 * Implements the pipeline in 03_TechSpec §6 and the rules in
 * 07_Security_and_Privacy §4:
 *
 *   - Private bucket. No public URLs, ever.
 *   - Upload: a signed upload URL (short TTL); the client PUTs bytes directly, so
 *     no file content passes through this API server.
 *   - Download: a signed GET URL with a 15-minute TTL.
 *   - Storage keys are random UUIDs, never derived from the filename or the
 *     student id, so a malicious filename cannot traverse or collide.
 *   - Deletion is two-phase: the row is marked deleted, then the object is
 *     removed.
 *
 * Supabase's signed upload URL is the equivalent of an S3 presigned PUT. It
 * carries a one-time token scoped to exactly one object path.
 */

import { randomUUID } from 'node:crypto';
import { env } from './env';
import { serverError } from './errors';
import { logger } from './logger';
import { supabaseAdmin } from './supabase';

/**
 * Builds the object path.
 *
 * Shape: `<ownerUserId>/<uuid>.<ext>`
 *
 * The owner prefix is deliberate: it makes per-user cleanup and storage accounting
 * possible. It is not a security boundary — the bucket is private and every
 * download is mediated by an authorization check in the API. The client's filename
 * is discarded entirely; only a validated extension is kept so browser downloads
 * behave sensibly.
 */
export function buildStorageKey(options: { ownerUserId: string; filename: string }): string {
  const extension = extractSafeExtension(options.filename);
  const suffix = extension ? `.${extension}` : '';
  return `${options.ownerUserId}/${randomUUID()}${suffix}`;
}

/** Lowercase alphanumeric extension, max 8 chars, or null when absent/suspicious. */
function extractSafeExtension(filename: string): string | null {
  const parts = filename.split('.');
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 1]?.toLowerCase() ?? '';
  if (!/^[a-z0-9]{1,8}$/u.test(candidate)) return null;
  return candidate;
}

export interface SignedUpload {
  /** The URL the client PUTs the file bytes to. */
  uploadUrl: string;
  /** Opaque token Supabase embeds in the URL; returned for clients that prefer the SDK. */
  token: string;
  storageKey: string;
  expiresIn: number;
}

/**
 * Issues a signed upload URL for a brand-new object.
 *
 * `createSignedUploadUrl` fails if the path already exists, which is the property
 * we want: a storage key is single-use, so a replayed upload-url request cannot
 * overwrite an already-verified document.
 */
export async function createSignedUploadUrl(storageKey: string): Promise<SignedUpload> {
  const { data, error } = await supabaseAdmin()
    .storage.from(env.STORAGE_BUCKET)
    .createSignedUploadUrl(storageKey);

  if (error || !data) {
    // `storage.objects` has RLS on with no policies, so anything other than
    // service_role is rejected. An RLS error here means this client is not acting
    // as service_role — usually because a sign-in mutated the shared admin client.
    logger.error(
      { storageKey, bucket: env.STORAGE_BUCKET, error: error?.message },
      'Failed to create signed upload URL',
    );
    throw serverError('Could not start the upload. Try again.');
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    storageKey: data.path,
    // Supabase signed upload URLs are valid for 2 hours; we advertise the shorter
    // policy TTL from 03_TechSpec §6 so clients do not sit on a stale URL.
    expiresIn: env.STORAGE_UPLOAD_URL_TTL,
  };
}

export interface SignedDownload {
  downloadUrl: string;
  expiresIn: number;
}

/**
 * MIME types that may be served without the attachment header, for preview.
 *
 * Deliberately its own list rather than a reference to `ALLOWED_MIME_TYPES`. That list
 * answers "may a student upload this?"; this one answers "may a viewer be told to
 * render this inside our storage origin?" — and the day someone adds `image/svg+xml`
 * or `text/html` to the upload policy, only the first answer should change. Pointing
 * both at one constant would turn an upload-policy edit into stored XSS.
 */
const INLINE_RENDERABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

/** Whether `mimeType` is safe to hand to a viewer with an inline disposition. */
export function isInlineRenderable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  // Stored values are bare types, but a `; charset=` suffix must not defeat the check.
  const bare = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return INLINE_RENDERABLE_MIME_TYPES.has(bare);
}

/**
 * Issues a signed download URL with the 15-minute TTL from 07_Security_and_Privacy §4.
 *
 * `download` forces a Content-Disposition attachment header, so a stored HTML or
 * SVG payload cannot execute in the browser's origin if it ever slipped past MIME
 * validation. It stays the default for exactly that reason.
 *
 * `inline` drops that header so a viewer can render the file in place instead of
 * saving it. Callers must gate it on `isInlineRenderable`, which is what keeps the
 * mitigation above intact for everything that is not a PDF or a raster image.
 */
export async function createSignedDownloadUrl(
  storageKey: string,
  options?: { downloadFilename?: string; inline?: boolean },
): Promise<SignedDownload> {
  const { data, error } = await supabaseAdmin()
    .storage.from(env.STORAGE_BUCKET)
    .createSignedUrl(
      storageKey,
      env.STORAGE_DOWNLOAD_URL_TTL,
      options?.inline === true ? {} : { download: options?.downloadFilename ?? true },
    );

  if (error || !data) {
    logger.error({ storageKey, error: error?.message }, 'Failed to create signed download URL');
    throw serverError('Could not generate the download link. Try again.');
  }

  return {
    downloadUrl: data.signedUrl,
    expiresIn: env.STORAGE_DOWNLOAD_URL_TTL,
  };
}

/**
 * Confirms an object actually exists and reports its real size and MIME type.
 *
 * Called by `POST /api/documents/complete` before metadata is written. Without
 * this, a client could claim a 1 KB PDF, upload nothing, and leave a phantom
 * document row on the faculty checklist. It also means the stored `size_bytes`
 * is the true size rather than the client's claim.
 */
export async function statObject(
  storageKey: string,
): Promise<{ sizeBytes: number; mimeType: string | null } | null> {
  const lastSlash = storageKey.lastIndexOf('/');
  const folder = lastSlash === -1 ? '' : storageKey.slice(0, lastSlash);
  const name = lastSlash === -1 ? storageKey : storageKey.slice(lastSlash + 1);

  const { data, error } = await supabaseAdmin()
    .storage.from(env.STORAGE_BUCKET)
    .list(folder, { search: name, limit: 1 });

  if (error) {
    logger.error({ storageKey, error: error.message }, 'Failed to stat storage object');
    throw serverError('Could not verify the uploaded file.');
  }

  const match = data?.find((entry) => entry.name === name);
  if (!match) return null;

  const metadata = (match.metadata ?? {}) as { size?: number; mimetype?: string };
  return {
    sizeBytes: typeof metadata.size === 'number' ? metadata.size : 0,
    mimeType: metadata.mimetype ?? null,
  };
}

/**
 * Removes an object. Used as the second phase of deletion, after the row has been
 * marked deleted (07_Security_and_Privacy §4).
 *
 * Failure is logged but not thrown: the document is already unreachable through
 * the API, and an orphaned object is a housekeeping problem rather than a
 * user-facing error. A reaper job can sweep keys whose rows are soft-deleted.
 */
export async function deleteObject(storageKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin().storage.from(env.STORAGE_BUCKET).remove([storageKey]);

  if (error) {
    logger.warn(
      { storageKey, error: error.message },
      'Storage object deletion failed; row is already soft-deleted so it stays unreachable',
    );
    return false;
  }
  return true;
}


