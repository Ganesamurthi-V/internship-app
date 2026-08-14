/**
 * Audit logging — 02_SRS §6, 07_Security_and_Privacy §9.
 *
 * Records the actor, action, entity, client platform/version, IP and a metadata
 * diff for every sensitive event. The full list of events that must be audited is
 * in 07_Security_and_Privacy §9; `AuditAction` in @ims/shared-types enumerates
 * them so a typo cannot silently create a new action name.
 *
 * Design rule: writing an audit row must never fail the request that triggered it.
 * A logging outage should not stop a student submitting attendance. Failures are
 * logged loudly instead — except for the Critical events, where the caller can opt
 * into strict mode.
 */

import type { AuditAction, ClientPlatform } from '@ims/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from './prisma';
import { logger } from './logger';
import type { RequestContext } from './http';

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Null for unauthenticated events such as a failed login. */
  actorUserId?: string | null;
  /** Request context, so platform/version/IP are captured without each caller re-reading headers. */
  context?: Pick<RequestContext, 'ipAddress' | 'clientPlatform' | 'clientVersion'>;
  metadata?: Record<string, unknown> | null;
  /**
   * When true, a write failure propagates. Reserved for events where losing the
   * record is worse than failing the request — refresh-token reuse, role changes.
   */
  strict?: boolean;
  /** Pass a transaction client to make the audit row atomic with the change it describes. */
  tx?: PrismaTransaction;
}

/**
 * Metadata is JSONB, so it must be JSON-serialisable. Dates become ISO strings and
 * `undefined` values are dropped, which is what Prisma's Json type requires.
 */
function normaliseMetadata(metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  try {
    return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
  } catch {
    return { note: 'metadata was not serialisable' } as Prisma.InputJsonValue;
  }
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const client = input.tx ?? prisma;

  try {
    await client.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        clientPlatform: (input.context?.clientPlatform ?? null) as ClientPlatform | null,
        clientVersion: input.context?.clientVersion ?? null,
        ipAddress: input.context?.ipAddress ?? null,
        metadata: normaliseMetadata(input.metadata),
      },
    });
  } catch (error) {
    logger.error(
      {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to write audit log entry',
    );
    if (input.strict) throw error;
  }
}

/**
 * Builds a before/after diff for an update, including only the fields that
 * actually changed.
 *
 * Used as audit metadata for edits that 07_Security_and_Privacy §9 flags, such as
 * post-submission attendance edits and mentor evaluation edits, so a reviewer can
 * see what changed rather than just that something did.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options?: { redact?: readonly string[] },
): Record<string, { from: unknown; to: unknown }> {
  const redact = new Set(options?.redact ?? []);
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const previous = before[key];
    const next = after[key];
    if (next === undefined) continue;

    // Compare serialised forms so Date and Decimal instances compare by value.
    if (JSON.stringify(serialise(previous)) === JSON.stringify(serialise(next))) continue;

    diff[key] = redact.has(key)
      ? { from: '[redacted]', to: '[redacted]' }
      : { from: serialise(previous), to: serialise(next) };
  }

  return diff;
}

function serialise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toNumber' in value) {
    // Prisma Decimal
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}
