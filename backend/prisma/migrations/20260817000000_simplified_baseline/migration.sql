-- =============================================================================
-- Baseline schema â€” simplified app
--
-- Replaces the entire earlier migration history. The app was reduced to one loop:
-- faculty configure daily questions, a student answers them and attaches files,
-- and that submission is the attendance record which faculty approve or decline.
--
-- This migration drops every table and type from the previous design. It is
-- destructive by intent and was applied to a database holding only seeded demo
-- data (verified zero documents before running).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Tear down the previous schema
-- -----------------------------------------------------------------------------
-- CASCADE handles the foreign keys between them, so no ordering is required.
DROP TABLE IF EXISTS "skill_ratings" CASCADE;
DROP TABLE IF EXISTS "mentor_evaluations" CASCADE;
DROP TABLE IF EXISTS "final_assessments" CASCADE;
DROP TABLE IF EXISTS "weekly_reports" CASCADE;
DROP TABLE IF EXISTS "daily_work_logs" CASCADE;
DROP TABLE IF EXISTS "attendance" CASCADE;
DROP TABLE IF EXISTS "notification_logs" CASCADE;
DROP TABLE IF EXISTS "export_jobs" CASCADE;
DROP TABLE IF EXISTS "app_settings" CASCADE;
DROP TABLE IF EXISTS "password_reset_tokens" CASCADE;
DROP TABLE IF EXISTS "user_sessions" CASCADE;
DROP TABLE IF EXISTS "device_tokens" CASCADE;
DROP TABLE IF EXISTS "documents" CASCADE;
DROP TABLE IF EXISTS "internships" CASCADE;
DROP TABLE IF EXISTS "mentors" CASCADE;
DROP TABLE IF EXISTS "organisations" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "students" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "departments" CASCADE;

DROP TYPE IF EXISTS "InternshipDomain";
DROP TYPE IF EXISTS "InternshipMode";
DROP TYPE IF EXISTS "InternshipStatus";
DROP TYPE IF EXISTS "AttendanceStatus";
DROP TYPE IF EXISTS "AttendanceMode";
DROP TYPE IF EXISTS "CompletionStatus";
DROP TYPE IF EXISTS "DeliverableType";
DROP TYPE IF EXISTS "ObjectivesStatus";
DROP TYPE IF EXISTS "SkillType";
DROP TYPE IF EXISTS "DocumentType";
DROP TYPE IF EXISTS "VerificationStatus";
DROP TYPE IF EXISTS "ExportJobStatus";
DROP TYPE IF EXISTS "DevicePlatform";
DROP TYPE IF EXISTS "UserRole";
DROP TYPE IF EXISTS "UserStatus";
DROP TYPE IF EXISTS "ClientPlatform";
DROP TYPE IF EXISTS "SubmissionStatus";
DROP TYPE IF EXISTS "QuestionType";

-- -----------------------------------------------------------------------------
-- 1. New schema
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'faculty', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'pending');

-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('text', 'long_text', 'number', 'choice');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "name" TEXT,
    "department_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT 'Sri Manakula Vinayagar Engineering College',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "register_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "department_id" UUID,
    "year" INTEGER,
    "section" TEXT,
    "student_email" TEXT NOT NULL,
    "mobile" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "help_text" TEXT,
    "type" "QuestionType" NOT NULL DEFAULT 'long_text',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB,
    "min_length" INTEGER,
    "max_length" INTEGER,
    "department_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_submissions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "submission_date" DATE NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "prompt_snapshot" TEXT NOT NULL,
    "answer_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "submission_id" UUID,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "client_platform" "ClientPlatform",
    "client_version" TEXT,
    "ip_address" INET,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_id_key" ON "users"("auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_auth_id_idx" ON "users"("auth_id");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_institution_key" ON "departments"("name", "institution");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_register_number_key" ON "students"("register_number");

-- CreateIndex
CREATE INDEX "students_register_number_idx" ON "students"("register_number");

-- CreateIndex
CREATE INDEX "students_department_id_idx" ON "students"("department_id");

-- CreateIndex
CREATE INDEX "questions_is_active_sort_order_idx" ON "questions"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "questions_department_id_idx" ON "questions"("department_id");

-- CreateIndex
CREATE INDEX "daily_submissions_status_submission_date_idx" ON "daily_submissions"("status", "submission_date");

-- CreateIndex
CREATE INDEX "daily_submissions_student_id_submission_date_idx" ON "daily_submissions"("student_id", "submission_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_submissions_student_id_submission_date_key" ON "daily_submissions"("student_id", "submission_date");

-- CreateIndex
CREATE INDEX "answers_submission_id_idx" ON "answers"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_submission_id_question_id_key" ON "answers"("submission_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_owner_user_id_idx" ON "documents"("owner_user_id");

-- CreateIndex
CREATE INDEX "documents_submission_id_idx" ON "documents"("submission_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_submissions" ADD CONSTRAINT "daily_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_submissions" ADD CONSTRAINT "daily_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "daily_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "daily_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- -----------------------------------------------------------------------------
-- 2. CHECK constraints the Prisma schema documents but cannot express
-- -----------------------------------------------------------------------------

ALTER TABLE "students"
  ADD CONSTRAINT "students_year_range" CHECK ("year" IS NULL OR ("year" BETWEEN 1 AND 5));

-- A register number is the master key for a student and is stored uppercase, so
-- the database refuses anything else rather than trusting every write path.
ALTER TABLE "students"
  ADD CONSTRAINT "students_register_number_upper" CHECK ("register_number" = upper("register_number"));

-- An answer with no content is not an answer. Required-ness per question is
-- enforced by the validators; this only rejects whitespace-only rows.
ALTER TABLE "answers"
  ADD CONSTRAINT "answers_text_not_blank" CHECK (btrim("answer_text") <> '');

-- A review decision must carry its reviewer and timestamp together. Half-written
-- review state would make the audit trail unreadable.
ALTER TABLE "daily_submissions"
  ADD CONSTRAINT "daily_submissions_review_complete" CHECK (
    ("status" = 'pending' AND "reviewed_by" IS NULL AND "reviewed_at" IS NULL)
    OR ("status" <> 'pending' AND "reviewed_at" IS NOT NULL)
  );

-- A declined submission has to say why, otherwise the student cannot act on it.
ALTER TABLE "daily_submissions"
  ADD CONSTRAINT "daily_submissions_decline_has_reason" CHECK (
    "status" <> 'declined' OR btrim(coalesce("review_note", '')) <> ''
  );

-- Sizes come from the client; the ceiling matches the Storage bucket limit below.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_size_positive" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760);

-- Questions with a bounded answer length need the bounds to make sense.
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_length_bounds" CHECK (
    "min_length" IS NULL OR "max_length" IS NULL OR "min_length" <= "max_length"
  );

-- -----------------------------------------------------------------------------
-- 3. Private documents bucket
-- -----------------------------------------------------------------------------
--
-- `public = false` so there are no public URLs; files are reached only through
-- signed URLs minted by the API with the service-role key. The size limit and
-- MIME allow-list are enforced by Storage itself, so an oversized or wrong-typed
-- upload is rejected at the edge even if a client skips its own check.
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

-- -----------------------------------------------------------------------------
-- 4. Row Level Security on every application table, with no policies
-- -----------------------------------------------------------------------------
--
-- The API enforces authorization in application code and connects as `postgres`,
-- which carries BYPASSRLS, so these do not affect normal operation. They are
-- defence in depth: a Supabase project exposes a public `anon` key by design, and
-- without RLS that key can read every table over the auto-generated REST API.
-- Enabling RLS with no permissive policies makes the tables unreachable to `anon`
-- and `authenticated`.
do $$
declare
  target_table text;
  app_tables text[] := array[
    'users',
    'departments',
    'students',
    'questions',
    'daily_submissions',
    'answers',
    'documents',
    'audit_logs'
  ];
begin
  foreach target_table in array app_tables loop
    execute format('alter table public.%I enable row level security;', target_table);
    -- FORCE applies the policies to the table owner too, so a future non-superuser
    -- service account cannot silently sidestep them.
    execute format('alter table public.%I force row level security;', target_table);
  end loop;
end $$;
