/**
 * Login, lockout and password-reset logic — 07_Security_and_Privacy §5.
 *
 * Account lockout is enforced in the database (`users.failed_login_attempts`,
 * `users.locked_until`) rather than in the rate limiter, deliberately: the
 * in-process limiter is per-instance, but lockout state must hold across every
 * instance. The rate limiter is the first line, lockout is the durable one.
 */

import type { LoginResponse } from '@ims/shared-types';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { forbidden, unauthorized } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import type { RequestContext } from '@/lib/http';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { signAccessToken } from '@/lib/auth/tokens';
import { createSession } from '@/lib/auth/session';
import { buildAuthenticatedUser } from './identity';

/**
 * One message for every credential failure.
 *
 * Wrong password, unknown email, and an account with no password all produce this
 * exact text, so the endpoint cannot be used to enumerate which addresses are
 * registered.
 */
const INVALID_CREDENTIALS = 'Email or password is incorrect.';

export async function login(
  input: { email: string; password: string },
  context: RequestContext,
): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      role: true,
    },
  });

  if (!user) {
    // Still spend the cost of a hash comparison so a missing account is not
    // detectable by response time.
    await verifyPassword(input.password, null);
    await recordAudit({
      action: 'login_failure',
      entityType: 'user',
      entityId: null,
      context,
      metadata: { email: input.email, reason: 'unknown_email' },
    });
    throw unauthorized(INVALID_CREDENTIALS);
  }

  // Lockout is checked before the password so a locked account cannot be probed.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    await recordAudit({
      action: 'login_failure',
      entityType: 'user',
      entityId: user.id,
      actorUserId: user.id,
      context,
      metadata: { reason: 'account_locked' },
    });
    throw forbidden(
      `Too many failed attempts. This account is locked for another ${minutes} minute(s).`,
    );
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);

  if (!passwordValid) {
    await registerFailedAttempt(user.id, user.failedLoginAttempts);
    await recordAudit({
      action: 'login_failure',
      entityType: 'user',
      entityId: user.id,
      actorUserId: user.id,
      context,
      metadata: { reason: 'bad_password', attempt: user.failedLoginAttempts + 1 },
    });
    throw unauthorized(INVALID_CREDENTIALS);
  }

  // A correct password on a suspended account is still a refusal, but with an
  // honest reason — the user needs to know to contact the office.
  if (user.status !== 'active') {
    await recordAudit({
      action: 'login_failure',
      entityType: 'user',
      entityId: user.id,
      actorUserId: user.id,
      context,
      metadata: { reason: `status_${user.status}` },
    });
    throw forbidden('This account is not active. Contact your department office.');
  }

  // Transparently upgrade a hash produced under a weaker cost factor.
  const rehash =
    user.passwordHash && needsRehash(user.passwordHash)
      ? await hashPassword(input.password)
      : undefined;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(rehash ? { passwordHash: rehash } : {}),
    },
  });

  const session = await createSession(user.id, {
    clientPlatform: context.clientPlatform,
    clientVersion: context.clientVersion,
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    sid: session.sessionId,
  });

  await recordAudit({
    action: 'login_success',
    entityType: 'user',
    entityId: user.id,
    actorUserId: user.id,
    context,
    metadata: { role: user.role },
  });

  return {
    accessToken,
    refreshToken: session.refreshToken,
    expiresIn: env.AUTH_ACCESS_TOKEN_EXPIRY,
    user: await buildAuthenticatedUser(user.id),
  };
}

/**
 * Increments the failure counter and locks the account on the tenth attempt.
 *
 * The lock lasts for the configured window rather than until an admin intervenes;
 * 07_Security_and_Privacy §5 also allows unlock via email, which the password reset
 * flow provides.
 */
async function registerFailedAttempt(userId: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1;
  const shouldLock = attempts >= env.AUTH_MAX_LOGIN_ATTEMPTS;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: attempts,
      ...(shouldLock
        ? { lockedUntil: new Date(Date.now() + env.AUTH_LOGIN_WINDOW_SECONDS * 1000) }
        : {}),
    },
  });
}
