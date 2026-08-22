-- The service_role key (used by lib/supabase-admin.ts for the due-date
-- reminder cron and TA error notifications) bypasses RLS but still needs
-- base table privileges, same as the authenticated-role gap fixed in
-- fix_ta_submissions_policy.sql. Without this, any admin-client query
-- fails with "permission denied for table X" (Postgres code 42501).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
