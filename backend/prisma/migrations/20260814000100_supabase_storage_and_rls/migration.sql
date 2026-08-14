-- =============================================================================
-- Supabase Storage bucket + Row Level Security lockdown
--
-- Runs after the initial schema migration. Two jobs:
--
--   1. Create the private `internship-documents` bucket declaratively, so a fresh
--      environment is reproducible from migrations alone rather than from clicks
--      in the dashboard.
--
--   2. Enable RLS on every application table with NO permissive policies.
--
-- On (2): this API enforces the 05_API_Spec authorization matrix in application
-- code, and connects through Prisma as the `postgres` role, which carries
-- BYPASSRLS — so these policies do not affect normal operation. They exist as
-- defence in depth. Supabase projects expose a public `anon` key by design, and
-- without RLS that key can read every table over the auto-generated REST API.
-- Enabling RLS with no policies makes the tables unreachable to `anon` and
-- `authenticated`, which is exactly what 07_Security_and_Privacy §8 requires:
-- "Do not expose student information through public URLs or unauthenticated
-- endpoints."
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Private documents bucket
-- -----------------------------------------------------------------------------
--
-- `public = false`     — no public URLs (07_Security_and_Privacy §4).
-- `file_size_limit`    — 10 MB, matching 02_SRS §3. Enforced by Storage itself,
--                        so an oversized upload is rejected at the edge even if a
--                        client skips its own check.
-- `allowed_mime_types` — PDF, JPG, PNG, HEIC only, per 02_SRS §3.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'internship-documents',
  'internship-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage objects are reached only through signed URLs minted by the API with the
-- service-role key. No policy is granted to `anon` or `authenticated`, so the
-- bucket is otherwise sealed.
alter table storage.objects enable row level security;

-- -----------------------------------------------------------------------------
-- 2. RLS on all application tables
-- -----------------------------------------------------------------------------
do $$
declare
  target_table text;
  app_tables text[] := array[
    'users',
    'user_sessions',
    'device_tokens',
    'departments',
    'organisations',
    'students',
    'mentors',
    'internships',
    'attendance',
    'daily_work_logs',
    'weekly_reports',
    'final_assessments',
    'skill_ratings',
    'mentor_evaluations',
    'documents',
    'audit_logs',
    'notification_logs',
    'password_reset_tokens',
    'export_jobs',
    'app_settings'
  ];
begin
  foreach target_table in array app_tables loop
    execute format('alter table public.%I enable row level security;', target_table);
    -- FORCE makes the policies apply to the table owner too, so a future
    -- non-superuser service account cannot silently sidestep them.
    execute format('alter table public.%I force row level security;', target_table);
  end loop;
end $$;

-- Revoke the blanket grants Supabase gives these roles on the public schema.
-- Belt and braces: RLS already blocks row access, but removing the grants means
-- the tables do not even appear in the auto-generated API surface.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Keep future tables locked by default, so adding a table cannot accidentally
-- publish it.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
