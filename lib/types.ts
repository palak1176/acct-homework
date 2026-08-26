export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "ta" | "student";
  gt_email: string | null;
}

export interface Question {
  id: string;
  chapter: number;
  title: string;
  prompt: string;
  correct_answer?: string;
  explanation?: string | null;
  created_at: string;
  type?: "text" | "multiple_choice" | "fill_blank" | "image" | "matching" | "grid";
  options?: any[] | GridData | null;
  due_at?: string | null;
  available_at?: string | null;
  points?: number;
  max_attempts?: number | null;
  tags?: string[] | null;
  order_index?: number;
}

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

export interface GridRow {
  label: string;
  cells: (number | null)[];
}

// Stored in a grid question's `options` column. Blank cells (to be
// filled by the student) are `null`; the correct values for those
// blanks live separately in `correct_answer` (a JSON map of
// "rowIndex-colIndex" -> correct value) so they aren't exposed via
// questions_public.
export interface GridData {
  columns: string[];
  rows: GridRow[];
}

export interface Submission {
  id: string;
  user_id: string;
  question_id: string;
  answer: string;
  submitted_at: string;
  is_correct?: boolean | null;
  score?: number | null;
  attempt_count?: number;
  image_url?: string | null;
  graded_at?: string | null;
  grader_note?: string | null;
  session_started_at?: string | null;
  flagged?: boolean;
}
