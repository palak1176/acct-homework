-- Fixes: /api/reset-submission returns "permission denied for table
-- submissions" (code 42501). Same class of issue as
-- fix_ta_submissions_policy.sql - the "authenticated" role was granted
-- SELECT, INSERT, UPDATE on submissions but never DELETE, so Postgres
-- blocks the query before RLS is even evaluated. There was also no RLS
-- policy permitting deletes at all.

GRANT DELETE ON public.submissions TO authenticated;

CREATE POLICY "TA can delete own submissions" ON public.submissions FOR DELETE USING (
  auth.uid() = user_id AND public.is_ta()
);
