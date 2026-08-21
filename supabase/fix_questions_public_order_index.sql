-- questions_public was redefined in add_available_at.sql without order_index,
-- so drag-reordering on the instructor page (which writes order_index) never
-- showed up for students or in analytics, both of which read from this view.

DROP VIEW IF EXISTS public.questions_public;

CREATE VIEW public.questions_public
WITH (security_invoker = true)
AS
SELECT id, chapter, title, prompt, type, options, due_at, available_at, points, explanation, order_index, created_at
FROM public.questions;

GRANT SELECT ON public.questions_public TO authenticated;
