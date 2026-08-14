-- Switch to Supabase Auth: add auth_id, drop custom session/password infrastructure.

-- Add the auth_id column that links to Supabase auth.users
ALTER TABLE "users" ADD COLUMN "auth_id" TEXT;

-- Make it unique (one auth account = one app user)
CREATE UNIQUE INDEX "users_auth_id_key" ON "users"("auth_id");

-- Create an index for fast lookups by auth_id
CREATE INDEX "users_auth_id_idx" ON "users"("auth_id");

-- Drop old custom auth columns from users (if they exist)
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
ALTER TABLE "users" DROP COLUMN IF EXISTS "failed_login_attempts";
ALTER TABLE "users" DROP COLUMN IF EXISTS "locked_until";
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at";

-- Drop the old session and password reset tables
DROP TABLE IF EXISTS "user_sessions";
DROP TABLE IF EXISTS "password_reset_tokens";
