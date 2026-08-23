/**
 * POST /api/auth/register-upload — issue a signed upload URL for the
 * student self-registration flow.
 *
 * This endpoint is intentionally unauthenticated: the student has not yet
 * created an account, so they cannot carry a session token.
 *
 * Unlike the authenticated `/api/documents/upload-url`, this route does NOT
 * create a Document row — that happens inside `/api/auth/student-register`
 * after the user account is created. The response carries only the signed
 * URL and the storage key; the client stores those locally and submits them
 * with the registration form.
 *
 * Rate-limited by IP to prevent storage abuse.
 */

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { uploadUrlSchema } from '@ims/shared-validation';
import { created, getClientIp, parseJson, withErrorHandling } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { createSignedUploadUrl } from '@/lib/storage';
import { UPLOAD_URL_TTL_SECONDS } from '@ims/shared-types';

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Rate-limit by IP to prevent storage abuse from unauthenticated callers.
  const ip = getClientIp(request) ?? 'unknown';
  await enforceRateLimit('uploadUrl', `anon:${ip}`);

  const input = await parseJson(request, uploadUrlSchema);

  // Build a unique storage key under the pre-registration namespace.
  const parts = input.filename.split('.');
  const candidate = parts[parts.length - 1]?.toLowerCase() ?? '';
  const ext = /^[a-z0-9]{1,8}$/u.test(candidate) ? candidate : null;
  const storageKey = `pre-registration/${randomUUID()}${ext ? `.${ext}` : ''}`;

  const signed = await createSignedUploadUrl(storageKey);

  return created({
    uploadUrl: signed.uploadUrl,
    storageKey: signed.storageKey,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
