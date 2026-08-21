-- "Labeling" and "matching" questions were graded and rendered identically,
-- so this collapses labeling into matching: converts existing labeling rows,
-- then removes labeling from the allowed type values.

UPDATE questions SET type = 'matching' WHERE type = 'labeling';

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('text', 'multiple_choice', 'fill_blank', 'image', 'matching'));
