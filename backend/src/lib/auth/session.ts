/**
 * Refresh-token session lifecycle — 07_Security_and_Privacy §5.
 *
 * Implements rotation with theft detection:
 *
 *   - Every login starts a new session *family*.
 *   - Every refresh issues a new token and marks the old one rotated.
 *   - Presenting an already-rotated token is treated as a compromise signal: the
 *     entire family is revoked, an audit row is written at Critical sensitivity,
 *     and the request fails.
 *
 * Why family-wide revocation: if a rotated token is replayed, either the attacker
 * or the legitimate client is holding a stolen copy, and there is no way to tell
 * which. Revoking everything forces a fresh login, which is the only safe outcome.
 */

import type { ClientPlatform } from '@ims/shared-types';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { unauthorized } from '../errors';
import { logger } from '../logger';
import { recordAudit } from '../audit';
import type { RequestContext } from '../http';
import { env } from '../env';
import { generateRefreshToken, hashRefreshToken } from './tokens';

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

interface SessionClientInfo {
  clientPlatform?: ClientPlatform | undefined;
  clientVersion?: string | undefined;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.AUTH_REFRESH_TOKEN_EXPIRY * 1000);
}

/** Starts a new session family. Called on successful login only. */
export async function createSession(
  userId: string,
  info: SessionClientInfo,
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const expiresAt = refreshExpiry();
  const familyId = randomUUID();

  const session = await prisma.userSession.create({
    data: {
      userId,
      refreshToken: hashRefreshToken(refreshToken),
      familyId,
      clientPlatform: info.clientPlatform ?? null,
      clientVersion: info.clientVersion ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  return { sessionId: session.id, refreshToken, expiresAt };
}

export interface RotationResult extends IssuedSession {
  userId: string;
}

/**
 * Validates a refresh token and rotates it.
 *
 * Ordering matters here. The lookup is by token hash, so an unknown token is
 * simply invalid. A *known* token that has already been rotated is the theft
 * signal, and is handled before any expiry or revocation check — a replayed token
 * is worth reacting to even if it has since expired.
 */
export async function rotateSession(
  presentedToken: string,
  context: RequestContext,
): Promise<RotationResult> {
  const tokenHash = hashRefreshToken(presentedToken);

  const session = await prisma.userSession.findUnique({
    where: { refreshToken: tokenHash },
    select: {
      id: true,
      userId: true,
      familyId: true,
      rotatedAt: true,
      revokedAt: true,
      expiresAt: true,
      clientPlatform: true,
      clientVersion: true,
      user: { select: { status: true } },
    },
  });

  if (!session) {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  // Theft detection: this token was already exchanged for a newer one.
  if (session.rotatedAt) {
    await handleTokenReuse(session.userId, session.familyId, context);
    throw unauthorized('Your session has expired. Sign in again.');
  }

  if (session.revokedAt) {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  // A suspended account must not be able to refresh its way into the API.
  if (session.user.status !== 'active') {
    await revokeAllSessions(session.userId);
    throw unauthorized('This account is not active. Contact your department office.');
  }

  const nextToken = generateRefreshToken();
  const expiresAt = refreshExpiry();

  // One transaction: mark the presented token rotated and insert its successor.
  // If this half-completed, a client could be left with no usable token at all.
  const created = await prisma.$transaction(async (tx) => {
    await tx.userSession.update({
      where: { id: session.id },
      data: { rotatedAt: new Date() },
    });

    return tx.userSession.create({
      data: {
        userId: session.userId,
        refreshToken: hashRefreshToken(nextToken),
        familyId: session.familyId,
        clientPlatform: context.clientPlatform ?? session.clientPlatform,
        clientVersion: context.clientVersion ?? session.clientVersion,
        expiresAt,
      },
      select: { id: true },
    });
  });

  return {
    sessionId: created.id,
    userId: session.userId,
    refreshToken: nextToken,
    expiresAt,
  };
}

/**
 * Reacts to a replayed refresh token: revoke the whole family and audit it.
 *
 * Audited in strict mode — 07_Security_and_Privacy §9 rates refresh token reuse as
 * Critical, so losing this record is worse than failing the request.
 */
async function handleTokenReuse(
  userId: string,
  familyId: string,
  context: RequestContext,
): Promise<void> {
  logger.warn({ userId, familyId, ip: context.ipAddress }, 'Refresh token reuse detected');

  await prisma.userSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    action: 'refresh_token_reuse_detected',
    entityType: 'user_session',
    entityId: null,
    actorUserId: userId,
    context,
    metadata: { familyId, reason: 'A rotated refresh token was presented again.' },
    strict: true,
  });
}

/** Revokes one session. Used by logout. */
export async function revokeSessionByToken(presentedToken: string): Promise<boolean> {
  const result = await prisma.userSession.updateMany({
    where: { refreshToken: hashRefreshToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Revokes one session by id, scoped to the owning user so a crafted session id
 * cannot revoke somebody else's session. Used by logout when the client no longer
 * holds its refresh token.
 */
export async function revokeSessionById(userId: string, sessionId: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** Revokes every active session for a user. Used by logout-all, suspension, password reset. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Deletes sessions that expired more than 30 days ago.
 *
 * Retained briefly rather than deleted on expiry so that theft detection still
 * works for a token replayed shortly after it lapsed.
 */
export async function pruneExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.userSession.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return result.count;
}
