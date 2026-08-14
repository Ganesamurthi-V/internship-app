/**
 * Validated environment configuration.
 *
 * Parsed once at module load and exported as a frozen object, so a
 * missing or malformed variable fails fast at boot instead of surfacing as a
 * confusing runtime error on the first request that happens to need it.
 *
 * 07_Security_and_Privacy §6 requires secrets to stay out of source control; this
 * module is the only place that reads `process.env`.
 */

import { z } from 'zod';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  LOGIN_ATTEMPT_WINDOW_SECONDS,
  MAX_FILE_SIZE_BYTES,
  MAX_LOGIN_ATTEMPTS,
  PASSWORD_RESET_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
} from '@ims/shared-types';

const seconds = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Supabase pooled connection (Supavisor, port 6543) used by the app at runtime. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  /**
   * Supabase direct connection (port 5432), used only by Prisma Migrate.
   * Optional at runtime so the deployed app does not need it.
   */
  DIRECT_URL: z.string().optional(),

  /**
   * Signing key for access tokens. 32 bytes minimum — a shorter secret weakens
   * HS256 to the point where the token is guessable offline.
   */
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32'),
  AUTH_ACCESS_TOKEN_EXPIRY: seconds(ACCESS_TOKEN_TTL_SECONDS),
  AUTH_REFRESH_TOKEN_EXPIRY: seconds(REFRESH_TOKEN_TTL_SECONDS),
  AUTH_ISSUER: z.string().default('ims'),
  AUTH_AUDIENCE: z.string().default('ims-clients'),
  AUTH_RESET_TOKEN_EXPIRY: seconds(PASSWORD_RESET_TTL_SECONDS),
  AUTH_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(MAX_LOGIN_ATTEMPTS),
  AUTH_LOGIN_WINDOW_SECONDS: seconds(LOGIN_ATTEMPT_WINDOW_SECONDS),

  // -------------------------------------------------------------------------
  // Supabase — project API + Storage
  // -------------------------------------------------------------------------

  /** e.g. https://abcdefghijkl.supabase.co */
  SUPABASE_URL: z.string().url().optional(),

  /**
   * Service-role key. Bypasses RLS, so it is a full-database credential and must
   * never reach the mobile bundle. Only ever read in server-side modules.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  /** Anon key. Safe to expose, but this API has no need for it beyond diagnostics. */
  SUPABASE_ANON_KEY: z.string().optional(),

  /** Private Storage bucket holding all internship documents. */
  STORAGE_BUCKET: z.string().default('internship-documents'),
  STORAGE_UPLOAD_URL_TTL: seconds(UPLOAD_URL_TTL_SECONDS),
  STORAGE_DOWNLOAD_URL_TTL: seconds(DOWNLOAD_URL_TTL_SECONDS),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(MAX_FILE_SIZE_BYTES),

  APP_URL: z.string().url().default('http://localhost:3000'),
  WEB_APP_URL: z.string().url().default('http://localhost:3001'),
  INSTITUTION_NAME: z.string().default('Sri Manakula Vinayagar Engineering College'),

  /**
   * Timezone used to decide what "today" is for attendance, work logs and
   * notification schedules. Defaults to IST because the deployment target is an
   * Indian institution; see src/lib/clock.ts for why this cannot be UTC.
   */
  INSTITUTION_TIMEZONE: z
    .string()
    .default('Asia/Kolkata')
    .refine(
      (zone) => {
        try {
          new Intl.DateTimeFormat('en-CA', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'INSTITUTION_TIMEZONE must be a valid IANA timezone, e.g. Asia/Kolkata.' },
    ),

  EXPO_PUSH_API_URL: z.string().url().default('https://exp.host/--/api/v2/push/send'),
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /** Absent means the in-process rate limiter is used. Fine for one instance only. */
  REDIS_URL: z.string().optional(),

  CRON_SECRET: z.string().optional(),

  /**
   * 02_SRS §2.1: "A student may have one active internship at a time (institution
   * may override)." This is that override, defaulting to the restrictive
   * behaviour.
   */
  ALLOW_MULTIPLE_ACTIVE_INTERNSHIPS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.output<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  /**
   * Next sets `NODE_ENV=production` while running `next build`, and importing a route
   * during the "collecting page data" phase would trip the production checks below.
   * A build machine legitimately has no production secrets — CI builds an artefact,
   * the runtime supplies the configuration — so the strict checks are skipped during
   * the build and applied when the server actually starts serving.
   */
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  // Fail loudly rather than shipping a placeholder secret to production.
  if (value.NODE_ENV === 'production' && !isBuildPhase) {
    if (value.AUTH_SECRET.includes('change-me') || value.AUTH_SECRET.includes('dev-only')) {
      throw new Error('AUTH_SECRET still holds a placeholder value. Set a real secret.');
    }
    if (!value.SUPABASE_URL || !value.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production for document storage.',
      );
    }
    if (!value.APP_URL.startsWith('https://')) {
      throw new Error('APP_URL must use HTTPS in production (07_Security_and_Privacy §3.3).');
    }
  }

  return value;
}

export const env: Env = Object.freeze(loadEnv());

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * True when Supabase Storage is configured well enough to issue signed URLs.
 * Document endpoints return a clear 500 rather than a cryptic SDK error when this
 * is false, which is the common state on a fresh checkout.
 */
export const isStorageConfigured =
  Boolean(env.SUPABASE_URL) && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
