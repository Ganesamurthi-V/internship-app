/**
 * Rate limiting — 07_Security_and_Privacy §6.
 *
 *   Auth endpoints:        10/min per IP
 *   Upload URL generation: 30/min per user
 *   Report export:          5/min per user
 *   General API:          200/min per user
 *
 * Implemented as a fixed-window counter behind a small `RateLimitStore` interface.
 *
 * KNOWN LIMITATION: the default store is in-process. That is correct for a single
 * instance and for local development, but on a multi-instance or serverless
 * deployment each instance keeps its own counters, so the effective limit is
 * multiplied by the instance count. 03_TechSpec §3.2 lists Redis for "rate-limit
 * counters"; wiring a Redis store in means implementing this same interface and
 * passing it to `setRateLimitStore`. The login path does not depend on this alone —
 * `users.failed_login_attempts` enforces account lockout in the database, which is
 * shared across instances regardless.
 */

import { RATE_LIMITS, type RateLimitName, type RateLimitRule } from '@ims/shared-types';
import { rateLimited } from './errors';
import { logger } from './logger';
import { env } from './env';

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  /** Unix ms when the current window ends. */
  resetAt: number;
}

export interface RateLimitStore {
  /** Increments the counter for `key` and returns the new count plus window end. */
  increment(key: string, windowSeconds: number): Promise<{ count: number; resetAt: number }>;
}

/**
 * In-process fixed-window store.
 *
 * Entries are lazily expired on read and swept periodically, so an idle process
 * does not grow unbounded from one-off IP keys.
 */
class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  async increment(key: string, windowSeconds: number) {
    const now = Date.now();
    this.sweep(now);

    const existing = this.windows.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return existing;
    }

    const fresh = { count: 1, resetAt: now + windowSeconds * 1000 };
    this.windows.set(key, fresh);
    return fresh;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore: RateLimitStore | undefined;
};

globalForRateLimit.rateLimitStore ??= new MemoryRateLimitStore();

/** Swap in a shared store (Redis, Upstash) for multi-instance deployments. */
export function setRateLimitStore(store: RateLimitStore): void {
  globalForRateLimit.rateLimitStore = store;
}

function store(): RateLimitStore {
  return globalForRateLimit.rateLimitStore!;
}

if (env.REDIS_URL) {
  logger.warn(
    'REDIS_URL is set but the in-process rate limit store is still active. ' +
      'Call setRateLimitStore() with a Redis-backed implementation to use it.',
  );
}

/**
 * Applies a named limit and throws 429 when exceeded.
 *
 * `identifier` must already be the right thing for the rule's `keyBy`: an IP for
 * `auth`, a user id otherwise. Callers pass it explicitly rather than having this
 * function reach into the request, so a limit can also be applied to a background
 * job or a batch item.
 */
export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string | null,
): Promise<RateLimitVerdict> {
  const rule: RateLimitRule = RATE_LIMITS[name];

  // A missing identifier (no IP behind a misconfigured proxy) is bucketed together
  // rather than skipped, so the limit still applies to the aggregate.
  const key = `${name}:${identifier ?? 'unknown'}`;

  const { count, resetAt } = await store().increment(key, rule.windowSeconds);
  const remaining = Math.max(0, rule.limit - count);

  if (count > rule.limit) {
    logger.debug({ name, identifier, count, limit: rule.limit }, 'Rate limit exceeded');
    throw rateLimited(
      `Too many requests. Try again in ${Math.ceil((resetAt - Date.now()) / 1000)} seconds.`,
    );
  }

  return { allowed: true, remaining, resetAt };
}

/**
 * Login limiting is doubled up per 07_Security_and_Privacy §5: "10 attempts per 15
 * minutes per IP **and** per email". Both counters must pass, so neither a single
 * IP spraying many accounts nor many IPs targeting one account gets through.
 */
export async function enforceLoginRateLimit(
  ipAddress: string | null,
  email: string,
): Promise<void> {
  await enforceRateLimit('auth', ipAddress);
  await enforceRateLimit('auth', `email:${email.toLowerCase()}`);
}
