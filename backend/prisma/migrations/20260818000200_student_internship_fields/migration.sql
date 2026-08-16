-- Add internship details to the student record, collected at registration.
-- Also makes `mobile` NOT NULL since it's used as the login password.

ALTER TABLE "students" ALTER COLUMN "mobile" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "mobile" SET DEFAULT '';

ALTER TABLE "students"
  ADD COLUMN "organisation_name" TEXT,
  ADD COLUMN "organisation_location" TEXT,
  ADD COLUMN "internship_domain" TEXT,
  ADD COLUMN "internship_mode" TEXT,
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE,
  ADD COLUMN "duration_days" INTEGER,
  ADD COLUMN "working_hours_per_day" INTEGER,
  ADD COLUMN "mentor_name" TEXT,
  ADD COLUMN "mentor_designation" TEXT,
  ADD COLUMN "mentor_contact" TEXT,
  ADD COLUMN "faculty_coordinator" TEXT,
  ADD COLUMN "offer_letter_doc_id" UUID,
  ADD COLUMN "joining_letter_doc_id" UUID;

-- Backfill any existing NULL mobile values before the constraint takes effect.
UPDATE "students" SET "mobile" = '' WHERE "mobile" IS NULL;
