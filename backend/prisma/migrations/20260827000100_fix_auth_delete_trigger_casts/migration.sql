-- Fixes the delete triggers added in 20260827000000.
--
-- `public.users.auth_id` is TEXT (the Prisma field has no @db.Uuid) while
-- `auth.users.id` is UUID. Postgres has no `text = uuid` operator, so both
-- triggers raised 42883 and aborted the surrounding DELETE. The net effect was
-- that deleting a user failed outright — GoTrue reported it as the unhelpful
-- "Database error deleting user".
--
-- Casts are chosen to avoid a second failure mode:
--
--   Trigger A casts the UUID to text (`OLD.id::text`). auth_id is text and
--   uniquely indexed, so the index is still usable.
--
--   Trigger B compares `id::text = OLD.auth_id` rather than casting auth_id to
--   uuid. Casting text -> uuid raises 22P02 on any malformed value, which would
--   make a single bad row permanently undeletable. auth.users holds one row per
--   account, so scanning it is not a concern.

-- ---------------------------------------------------------------------------
-- A. auth.users deleted  ->  remove the app user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.users WHERE auth_id = OLD.id::text;
  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- B. public.users deleted  ->  remove the Supabase Auth account
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_app_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Already gone means trigger A started this chain; deleting again would bounce.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text = OLD.auth_id) THEN
    DELETE FROM auth.users WHERE id::text = OLD.auth_id;
  END IF;
  RETURN OLD;
END;
$$;
