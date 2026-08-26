-- Keep Supabase Auth and the app tables in sync on delete.
--
-- THE PROBLEM
--
-- Supabase stores accounts in `auth.users`, which is a different table from the
-- app's `public.users`. Nothing linked the two on delete, so:
--
--   * Deleting in the Authentication UI (auth.users) left a `public.users` row
--     behind. That user could never log in — JWT verification resolved nothing.
--   * Deleting in the Table Editor (public.users) left the auth account behind,
--     which holds the email's unique constraint and locked that address out of
--     re-registration forever.
--
-- THE FIX
--
-- Two AFTER DELETE triggers that mirror the deletion across the boundary, plus one
-- on `students` so removing a student profile also removes their login. Triggers
-- run inside the deleting transaction, so this works from the Supabase dashboard,
-- raw SQL and the app API alike — there is no application code to bypass.
--
-- Everything downstream of `public.users` is already handled by existing FK
-- cascades: students -> daily_submissions -> answers, plus documents. `audit_logs`
-- and `questions.created_by` are ON DELETE SET NULL on purpose, so history and
-- authored questions survive the author being removed.
--
-- RECURSION
--
-- Each function checks the other side still exists before deleting, so the pair
-- settles after one hop instead of bouncing:
--
--   delete auth.users  -> A fires -> auth row already gone, B is a no-op.
--   delete public.users -> B fires -> deletes auth.users -> A fires -> public row
--                          already gone, 0 rows, no further trigger.

-- ---------------------------------------------------------------------------
-- A. auth.users deleted  ->  remove the app user (cascades to student, etc.)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER: the caller deleting from the Authentication UI does not
-- necessarily hold delete rights on public.users.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.users WHERE auth_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_deleted();

-- ---------------------------------------------------------------------------
-- B. public.users deleted  ->  remove the Supabase Auth account
-- ---------------------------------------------------------------------------
-- This is what frees the email address for re-registration.

CREATE OR REPLACE FUNCTION public.handle_app_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER: deleting from auth.users requires elevated rights that the
-- app's role does not have.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Skip when the auth row is already gone: that means trigger A started this
  -- chain, and deleting again would bounce back.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.auth_id) THEN
    DELETE FROM auth.users WHERE id = OLD.auth_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_app_user_deleted ON public.users;

CREATE TRIGGER on_app_user_deleted
  AFTER DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_app_user_deleted();

-- ---------------------------------------------------------------------------
-- C. students deleted  ->  remove the owning user (and so the auth account)
-- ---------------------------------------------------------------------------
-- A student user with no student row cannot use the app: requireAuth resolves
-- studentId from that row, so the account would authenticate into nothing.
--
-- The EXISTS guard is what stops this firing during a normal user delete, where
-- the FK cascade removes the student row after the user row is already gone.

CREATE OR REPLACE FUNCTION public.handle_student_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id) THEN
    DELETE FROM public.users WHERE id = OLD.user_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_student_deleted ON public.students;

CREATE TRIGGER on_student_deleted
  AFTER DELETE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_student_deleted();
