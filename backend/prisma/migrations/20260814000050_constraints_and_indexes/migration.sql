-- =============================================================================
-- CHECK constraints and search indexes
--
-- Everything here expresses a rule from docs/04_Database_Design.md §2 that the
-- Prisma schema language cannot represent, plus the trigram indexes that make the
-- keyword search in 02_SRS §7 fast.
--
-- Kept in its own migration so the preceding `_init` migration stays a pure
-- `prisma migrate diff` output and can be regenerated after a schema change
-- without losing this file.
-- =============================================================================

-- Fast case-insensitive keyword search over work logs (02_SRS §7:
-- "Daily activity history (searchable by date, tech, keyword)"). Without pg_trgm,
-- an ILIKE '%term%' degrades to a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- students
-- -----------------------------------------------------------------------------
ALTER TABLE "students"
  ADD CONSTRAINT "students_year_range" CHECK ("year" IS NULL OR ("year" BETWEEN 1 AND 5));

-- -----------------------------------------------------------------------------
-- internships
-- -----------------------------------------------------------------------------

-- The `valid_dates` constraint named in 04_Database_Design §2.
ALTER TABLE "internships"
  ADD CONSTRAINT "valid_dates" CHECK ("end_date" >= "start_date");

-- 02_SRS §2.1: "Working hours per day must be a positive number."
ALTER TABLE "internships"
  ADD CONSTRAINT "internships_working_hours_positive" CHECK ("working_hours_per_day" > 0);

-- Guards the server-computed replacement for the generated `duration_days` column:
-- it must always equal `end_date - start_date`. This keeps the documented
-- invariant enforceable at the database level even though the application writes
-- the value.
ALTER TABLE "internships"
  ADD CONSTRAINT "internships_duration_days_matches_dates"
  CHECK ("duration_days" = ("end_date" - "start_date"));

-- A rejected internship must say why; the student is shown this text.
ALTER TABLE "internships"
  ADD CONSTRAINT "internships_rejection_reason_present"
  CHECK ("status" <> 'rejected' OR "rejection_reason" IS NOT NULL);

-- -----------------------------------------------------------------------------
-- attendance
-- -----------------------------------------------------------------------------
--
-- `reporting_time` and `leaving_time` are stored as zero-padded 'HH:MM' text
-- rather than the document's TIME type. Rationale: the API speaks 'HH:MM', and
-- Prisma surfaces a TIME column as a 1970-epoch JavaScript Date, which invites
-- timezone bugs in exactly the place we can least afford them. Zero-padded text
-- compares correctly lexicographically, so `valid_times` below is identical in
-- effect to the documented constraint.
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_reporting_time_format"
  CHECK ("reporting_time" IS NULL OR "reporting_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_leaving_time_format"
  CHECK ("leaving_time" IS NULL OR "leaving_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- The `valid_times` constraint from 04_Database_Design §2.
ALTER TABLE "attendance"
  ADD CONSTRAINT "valid_times"
  CHECK ("leaving_time" IS NULL OR "reporting_time" IS NULL OR "leaving_time" > "reporting_time");

-- 02_SRS §2.2: "Leave/absence requires a reason field." Enforced here as well as
-- in Zod, so such a record cannot reach the table without one.
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_leave_reason_required"
  CHECK ("status" NOT IN ('absent', 'permission_leave') OR "leave_reason" IS NOT NULL);

ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_total_hours_non_negative"
  CHECK ("total_hours" IS NULL OR "total_hours" >= 0);

-- -----------------------------------------------------------------------------
-- weekly_reports
-- -----------------------------------------------------------------------------
ALTER TABLE "weekly_reports"
  ADD CONSTRAINT "weekly_reports_week_number_positive" CHECK ("week_number" >= 1);

ALTER TABLE "weekly_reports"
  ADD CONSTRAINT "weekly_reports_valid_dates" CHECK ("week_end_date" >= "week_start_date");

ALTER TABLE "weekly_reports"
  ADD CONSTRAINT "weekly_reports_aggregates_non_negative"
  CHECK (
    ("days_attended" IS NULL OR "days_attended" >= 0)
    AND ("total_hours" IS NULL OR "total_hours" >= 0)
  );

-- -----------------------------------------------------------------------------
-- final_assessments and skill_ratings — all ratings integer 1..5
-- -----------------------------------------------------------------------------
ALTER TABLE "final_assessments"
  ADD CONSTRAINT "final_assessments_usefulness_rating_range"
  CHECK ("usefulness_rating" IS NULL OR ("usefulness_rating" BETWEEN 1 AND 5));

ALTER TABLE "final_assessments"
  ADD CONSTRAINT "final_assessments_totals_non_negative"
  CHECK (
    ("total_days_attended" IS NULL OR "total_days_attended" >= 0)
    AND ("total_hours" IS NULL OR "total_hours" >= 0)
  );

ALTER TABLE "skill_ratings"
  ADD CONSTRAINT "skill_ratings_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- -----------------------------------------------------------------------------
-- mentor_evaluations — the ten parameters from 01_PRD §4.7
-- -----------------------------------------------------------------------------
ALTER TABLE "mentor_evaluations"
  ADD CONSTRAINT "mentor_evaluations_ratings_range" CHECK (
    ("technical_knowledge"     IS NULL OR ("technical_knowledge"     BETWEEN 1 AND 5)) AND
    ("problem_solving"         IS NULL OR ("problem_solving"         BETWEEN 1 AND 5)) AND
    ("communication"           IS NULL OR ("communication"           BETWEEN 1 AND 5)) AND
    ("teamwork"                IS NULL OR ("teamwork"                BETWEEN 1 AND 5)) AND
    ("professional_behaviour"  IS NULL OR ("professional_behaviour"  BETWEEN 1 AND 5)) AND
    ("punctuality_attendance"  IS NULL OR ("punctuality_attendance"  BETWEEN 1 AND 5)) AND
    ("ability_to_learn"        IS NULL OR ("ability_to_learn"        BETWEEN 1 AND 5)) AND
    ("initiative"              IS NULL OR ("initiative"              BETWEEN 1 AND 5)) AND
    ("quality_of_work"         IS NULL OR ("quality_of_work"         BETWEEN 1 AND 5)) AND
    ("overall_performance"     IS NULL OR ("overall_performance"     BETWEEN 1 AND 5))
  );

-- A confirmed evaluation must have every rating and a submission timestamp. This
-- is what makes "immutable after digital confirmation" (02_SRS §2.6) meaningful:
-- a half-filled record can never reach the confirmed state.
ALTER TABLE "mentor_evaluations"
  ADD CONSTRAINT "mentor_evaluations_complete_when_confirmed" CHECK (
    "digital_confirmation" = false OR (
      "technical_knowledge"    IS NOT NULL AND
      "problem_solving"        IS NOT NULL AND
      "communication"          IS NOT NULL AND
      "teamwork"               IS NOT NULL AND
      "professional_behaviour" IS NOT NULL AND
      "punctuality_attendance" IS NOT NULL AND
      "ability_to_learn"       IS NOT NULL AND
      "initiative"             IS NOT NULL AND
      "quality_of_work"        IS NOT NULL AND
      "overall_performance"    IS NOT NULL AND
      "submitted_at"           IS NOT NULL
    )
  );

-- -----------------------------------------------------------------------------
-- documents — 02_SRS §3 file rules, enforced at the last possible layer
-- -----------------------------------------------------------------------------
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_size_within_limit"
  CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760);

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_mime_type_allowed"
  CHECK ("mime_type" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'));

-- A rejected document must carry the reason the student needs in order to fix it.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_rejection_reason_present"
  CHECK ("verification_status" <> 'rejected' OR "rejection_reason" IS NOT NULL);

-- -----------------------------------------------------------------------------
-- export_jobs
-- -----------------------------------------------------------------------------
ALTER TABLE "export_jobs"
  ADD CONSTRAINT "export_jobs_progress_range" CHECK ("progress" BETWEEN 0 AND 100);

-- -----------------------------------------------------------------------------
-- Search indexes
-- -----------------------------------------------------------------------------

-- Technology tag aggregation across a cohort (02_SRS §7 "Technology usage tags").
CREATE INDEX "daily_work_logs_technologies_gin"
  ON "daily_work_logs" USING GIN ("technologies");

CREATE INDEX "weekly_reports_technologies_gin"
  ON "weekly_reports" USING GIN ("technologies_learned");

CREATE INDEX "final_assessments_technologies_gin"
  ON "final_assessments" USING GIN ("technologies_mastered");

-- Keyword search over the free-text work log fields.
CREATE INDEX "daily_work_logs_activities_trgm"
  ON "daily_work_logs" USING GIN ("activities" gin_trgm_ops);

-- Student lookup by name or register number in the faculty list screen.
CREATE INDEX "students_name_trgm" ON "students" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "students_register_number_trgm"
  ON "students" USING GIN ("register_number" gin_trgm_ops);
