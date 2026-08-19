/**
 * Prisma client singleton.
 *
 * Next.js dev mode hot-reloads modules on every edit, which would open a new
 * connection pool each time and exhaust Postgres within a few saves. Caching the
 * instance on `globalThis` is the standard way to survive that.
 */

import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: isProduction
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
  });

  client.$on('error', (event) => {
    logger.error({ target: event.target }, event.message);
  });

  if (!isProduction) {
    client.$on('warn', (event) => {
      logger.warn({ target: event.target }, event.message);
    });
  }

  return client;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// Cached in every environment, not just dev. On a serverless platform each warm
// instance re-uses this instance instead of opening a second pool against the
// pgBouncer pooler, which has a small per-project client budget.
globalForPrisma.prisma = prisma;

/** Narrow alias for functions that accept either the client or a transaction. */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Prisma's error code for a unique constraint violation. */
export const UNIQUE_VIOLATION = 'P2002';
/** Prisma's error code for a foreign key constraint violation. */
export const FOREIGN_KEY_VIOLATION = 'P2003';
/** Prisma's error code for "record not found". */
export const RECORD_NOT_FOUND = 'P2025';

export function isPrismaErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
