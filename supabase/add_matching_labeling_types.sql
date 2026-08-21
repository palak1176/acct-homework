-- Allow "matching" and "labeling" as question types. The existing
-- check constraint only allowed text/multiple_choice/fill_blank/image,
-- so creating a matching/labeling question violated it.

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('text', 'multiple_choice', 'fill_blank', 'image', 'matching', 'labeling'));
