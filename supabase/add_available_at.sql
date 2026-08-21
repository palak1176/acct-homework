-- Adds "available_at" (opens-at date) to questions, separate from
-- "due_at" (closes-at date). Students should not be able to submit
-- answers before this time. Also re-adds "explanation" to
-- questions_public, which the student view already reads but the
-- current live view definition does not select.

ALTER TABLE questions ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

DROP VIEW IF EXISTS public.questions_public;

CREATE VIEW public.questions_public
WITH (security_invoker = true)
AS
SELECT id, chapter, title, prompt, type, options, due_at, available_at, points, explanation, order_index, created_at
FROM public.questions;

GRANT SELECT ON public.questions_public TO authenticated;
