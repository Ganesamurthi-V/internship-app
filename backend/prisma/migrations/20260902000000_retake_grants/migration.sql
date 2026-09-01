-- Retake grants: permission for one student to answer one already-closed day.
--
-- Purely additive. Creates one new table and two foreign keys; touches no existing
-- table and rewrites no existing row, so it is safe to apply to a live database.
CREATE TABLE "retake_grants" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "expires_on" DATE NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- No default, matching what Prisma generates for `@updatedAt`: the client always
    -- supplies it, and adding a default here would show up as schema drift later.
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "retake_grants_pkey" PRIMARY KEY ("id")
);

-- One grant per student per day. Re-granting updates the row rather than stacking
-- duplicates that would each look separately available.
CREATE UNIQUE INDEX "retake_grants_student_id_target_date_key"
  ON "retake_grants"("student_id", "target_date");

-- Cascade: a deleted student's grants are meaningless.
ALTER TABLE "retake_grants"
  ADD CONSTRAINT "retake_grants_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull: removing a faculty account must not erase the record that a retake was
-- allowed, or attendance stops being auditable.
ALTER TABLE "retake_grants"
  ADD CONSTRAINT "retake_grants_granted_by_fkey"
  FOREIGN KEY ("granted_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
