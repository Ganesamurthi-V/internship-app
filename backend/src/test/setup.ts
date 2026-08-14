/**
 * Vitest setup.
 *
 * `src/lib/env.ts` validates configuration at import time and throws on anything
 * missing, which is the behaviour we want in production but means the test process
 * needs a valid environment before any module under test is loaded. These values are
 * syntactically valid and point nowhere real — the unit tests here exercise pure
 * logic and never open a connection.
 */

/**
 * `NODE_ENV` is typed as a read-only literal union by Next's ambient types, so it is
 * assigned through a widened view of `process.env` rather than directly. The runtime
 * behaviour is identical; this only sidesteps the compile-time narrowing.
 */
const mutableEnv = process.env as Record<string, string | undefined>;

mutableEnv.NODE_ENV = 'test';
mutableEnv.LOG_LEVEL = 'silent';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/internship_test';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

// 32+ characters, as env.ts requires.
process.env.AUTH_SECRET ??= 'test-secret-value-for-unit-tests-0123456789';

process.env.SUPABASE_URL ??= 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.STORAGE_BUCKET ??= 'internship-documents';

process.env.APP_URL ??= 'http://localhost:3000';
process.env.WEB_APP_URL ??= 'http://localhost:3001';
process.env.INSTITUTION_NAME ??= 'Test Institution';
process.env.INSTITUTION_TIMEZONE ??= 'Asia/Kolkata';
