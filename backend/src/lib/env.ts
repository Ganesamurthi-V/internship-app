/**
 * Validated environment configuration.
 *
 * Parsed once at module load. A missing or malformed variable fails fast at boot.
 * Auth is now handled by Supabase Auth — no custom JWT secrets needed.
 */

import { z } from 'zod';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_FILE_SIZE_BYTES,
  UPLOAD_URL_TTL_SECONDS,
} from '@ims/shared-types';

const seconds = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  DIRECT_URL: z.string().optional(),

  // -------------------------------------------------------------------------
  // Supabase
  // -------------------------------------------------------------------------

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL.'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required.'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required.'),

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  STORAGE_BUCKET: z.string().default('internship-documents'),
  STORAGE_UPLOAD_URL_TTL: seconds(UPLOAD_URL_TTL_SECONDS),
  STORAGE_DOWNLOAD_URL_TTL: seconds(DOWNLOAD_URL_TTL_SECONDS),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(MAX_FILE_SIZE_BYTES),

  // -------------------------------------------------------------------------
  // Application
  // -------------------------------------------------------------------------

  APP_URL: z.string().url().default('http://localhost:3000'),
  WEB_APP_URL: z.string().url().default('http://localhost:3001'),
  INSTITUTION_NAME: z.string().default('Sri Manakula Vinayagar Engineering College'),
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
      { message: 'INSTITUTION_TIMEZONE must be a valid IANA timezone.' },
    ),

  REDIS_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),

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

  return parsed.data;
}

export const env: Env = Object.freeze(loadEnv());

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const isStorageConfigured = Boolean(env.SUPABASE_URL) && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
