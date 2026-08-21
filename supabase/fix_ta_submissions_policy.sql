-- Fixes: Analytics page (and any submissions read) returns 403 with
-- "permission denied for table submissions" (code 42501). This is a
-- Postgres table-privilege error, not an RLS policy rejection — the
-- "TA can read all submissions" RLS policy is already correct and in
-- place, but the "authenticated" role was never GRANTed base SELECT
-- privilege on the table, so Postgres blocks the query before RLS is
-- even evaluated. "questions" got this grant explicitly; "submissions"
-- never did.

GRANT SELECT, INSERT, UPDATE ON public.submissions TO authenticated;

-- Fixes: Analytics page shows 0 Active Students even when students
-- exist. The "users" table only has a "Users can read own row" SELECT
-- policy (auth.uid() = id), so a TA querying role = 'student' gets an
-- empty result set (200 OK, no rows) rather than an error — RLS is
-- silently filtering everything out. Add a TA-wide read policy.
--
-- IMPORTANT: a policy on "users" cannot query "users" directly in a
-- subquery — Postgres has to re-evaluate that same policy to check
-- the subquery's own row visibility, which re-triggers the subquery,
-- infinitely. That's the "infinite recursion detected in policy for
-- relation users" failure, and it broke ALL reads of users (including
-- login's own role lookup) for every account, not just TAs. A
-- SECURITY DEFINER function sidesteps this: it runs with the
-- function owner's privileges, bypassing RLS internally, so the
-- lookup inside it doesn't re-trigger the policy that calls it.

GRANT SELECT ON public.users TO authenticated;

DROP POLICY IF EXISTS "TA can read all users" ON public.users;

CREATE OR REPLACE FUNCTION public.is_ta()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ta'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ta() TO authenticated;

CREATE POLICY "TA can read all users" ON public.users FOR SELECT USING (
  public.is_ta()
);
