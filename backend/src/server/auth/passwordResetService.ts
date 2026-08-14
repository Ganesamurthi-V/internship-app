/**
 * Password reset — 07_Security_and_Privacy §5.
 *
 * Single-use, one-hour token, emailed to the address on the account only. Only the
 * SHA-256 hash is stored, so a database dump cannot be used to reset anyone's
 * password.
 */

import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import type { RequestContext } from '@/lib/http';
import { generateSingleUseToken, hashSingleUseToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';
import { passwordResetEmail, sendMail } from '@/lib/mailer';

/**
 * Starts a reset.
 *
 * Always resolves successfully, whether or not the address exists. Reporting "no
 * such account" here would turn this endpoint into an email enumeration oracle,
 * and it is unauthenticated.
 */
export async function requestPasswordReset(
  email: string,
  context: RequestContext,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true },
  });

  if (!user || user.status === 'suspended') {
    logger.debug({ email }, 'Password reset requested for unknown or suspended account');
    return;
  }

  const { token, tokenHash } = generateSingleUseToken();
  const expiresAt = new Date(Date.now() + env.AUTH_RESET_TOKEN_EXPIRY * 1000);

  // Invalidate any outstanding tokens so only the newest link works. Without this,
  // an old email forwarded to someone else stays usable for an hour.
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);

  await sendMail(passwordResetEmail({ to: user.email, token }));

  await recordAudit({
    action: 'password_reset_requested',
    entityType: 'user',
    entityId: user.id,
    actorUserId: user.id,
    context,
  });
}

/**
 * Completes a reset.
 *
 * Side effects beyond changing the password:
 *   - the token is marked used, so the link cannot be replayed,
 *   - every session is revoked, since a reset usually means the account was
 *     compromised and existing refresh tokens must stop working,
 *   - the lockout counter is cleared, which is the "unlock via email" path in
 *     07_Security_and_Privacy §5.
 */
export async function completePasswordReset(
  input: { token: string; password: string },
  context: RequestContext,
): Promise<void> {
  const tokenHash = hashSingleUseToken(input.token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  const invalid = validationError('This reset link is invalid or has expired.', {
    token: 'Invalid or expired link. Request a new one.',
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw invalid;
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
  ]);

  await revokeAllSessions(record.userId);

  await recordAudit({
    action: 'password_reset_completed',
    entityType: 'user',
    entityId: record.userId,
    actorUserId: record.userId,
    context,
    metadata: { allSessionsRevoked: true },
  });
}
