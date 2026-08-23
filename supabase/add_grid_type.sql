-- Adds "grid" as a question type for spreadsheet-style problems with
-- several independent rows (e.g. Case A, B, C) and columns where some
-- cells are given and others are blank for the student to fill in
-- (e.g. "Inferring Values Using the Income Statement and Balance
-- Sheet Equations").
--
-- No new columns needed: reuses the existing `options` column to
-- store { columns, rows } with blank cells as `null` (safe to expose
-- via questions_public, since it holds no correct values), and the
-- existing `correct_answer` column to store a JSON map of
-- "rowIndex-colIndex" -> correct value for blank cells only.

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('text', 'multiple_choice', 'fill_blank', 'image', 'matching', 'grid'));
