/**
 * Vitest setup — provides env vars for Supabase Auth-based backend.
 */

const mutableEnv = process.env as Record<string, string | undefined>;

mutableEnv.NODE_ENV = 'test';
mutableEnv.LOG_LEVEL = 'silent';

mutableEnv.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/internship_test';
mutableEnv.DIRECT_URL ??= mutableEnv.DATABASE_URL;

mutableEnv.SUPABASE_URL ??= 'https://test-project.supabase.co';
mutableEnv.SUPABASE_ANON_KEY ??= 'test-anon-key-for-unit-tests';
mutableEnv.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
mutableEnv.STORAGE_BUCKET ??= 'internship-documents';

mutableEnv.APP_URL ??= 'http://localhost:3000';
mutableEnv.WEB_APP_URL ??= 'http://localhost:3001';
mutableEnv.INSTITUTION_NAME ??= 'Test Institution';
mutableEnv.INSTITUTION_TIMEZONE ??= 'Asia/Kolkata';
