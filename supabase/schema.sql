CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('ta', 'student')),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter INTEGER NOT NULL CHECK (chapter >= 1 AND chapter <= 12),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own row" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Authenticated users can read questions" ON questions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Only TA can insert questions" ON questions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ta')
);
CREATE POLICY "Students can read own submissions" ON submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "TA can read all submissions" ON submissions FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ta')
);
CREATE POLICY "Users can insert own submissions" ON submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Students can update own submissions" ON submissions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own row" ON users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE INDEX idx_questions_chapter ON questions(chapter);
CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_question_id ON submissions(question_id);

-- Phase 1 Schema Extensions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text' CHECK (type IN ('text', 'multiple_choice', 'fill_blank', 'image', 'matching'));
ALTER TABLE questions ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 1;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS max_attempts INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_limit_sec INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard'));
ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE questions ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS score NUMERIC;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS grader_note TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS question_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_group_members (
  group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Create view for student-safe question access (no correct_answer)
CREATE OR REPLACE VIEW questions_public AS
  SELECT id, chapter, title, prompt, type, options, due_at, points, max_attempts,
         time_limit_sec, difficulty, tags, order_index, created_at, explanation
  FROM questions;
