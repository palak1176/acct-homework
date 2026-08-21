-- Removes tables and columns that schema.sql created but no app code
-- ever reads or writes: question_images, study_groups,
-- study_group_members, and the questions.time_limit_sec /
-- questions.difficulty columns. Run this after the other migrations
-- on any database that already ran the old schema.sql.

DROP TABLE IF EXISTS study_group_members;
DROP TABLE IF EXISTS study_groups;
DROP TABLE IF EXISTS question_images;

ALTER TABLE questions DROP COLUMN IF EXISTS time_limit_sec;
ALTER TABLE questions DROP COLUMN IF EXISTS difficulty;
