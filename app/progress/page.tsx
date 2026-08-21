"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Question, Submission } from "@/lib/types";

interface ProgressData {
  total_questions: number;
  submitted_count: number;
  correct_count: number;
  total_score: number;
  total_possible: number;
  by_chapter: Array<{
    chapter: number;
    total: number;
    submitted: number;
    correct: number;
    score: number;
    possible: number;
  }>;
}

export default function Progress() {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: questionsData } = await supabase.from("questions_public").select("*").order("chapter").order("order_index");
    if (!questionsData) {
      setLoading(false);
      return;
    }
    const questions = questionsData as Question[];

    const { data: submissionsData } = await supabase.from("submissions").select("*").eq("user_id", user.id);
    if (!submissionsData) {
      setLoading(false);
      return;
    }
    const submissions = submissionsData as Submission[];

    const subMap = new Map(submissions.map(s => [s.question_id, s]));
    const by_chapter: ProgressData["by_chapter"] = [];

    let total_submitted = 0;
    let total_correct = 0;
    let total_score = 0;
    let total_possible = 0;

    for (let ch = 1; ch <= 12; ch++) {
      const chQuestions = questions.filter(q => q.chapter === ch);
      if (chQuestions.length === 0) continue;

      let ch_submitted = 0;
      let ch_correct = 0;
      let ch_score = 0;
      let ch_possible = 0;

      chQuestions.forEach(q => {
        ch_possible += q.points || 1;
        const sub = subMap.get(q.id);
        if (sub) {
          ch_submitted++;
          if (sub.is_correct) ch_correct++;
          if (sub.score != null) ch_score += sub.score;
        }
      });

      by_chapter.push({ chapter: ch, total: chQuestions.length, submitted: ch_submitted, correct: ch_correct, score: ch_score, possible: ch_possible });
      total_submitted += ch_submitted;
      total_correct += ch_correct;
      total_score += ch_score;
      total_possible += ch_possible;
    }

    setProgress({
      total_questions: questions.length,
      submitted_count: total_submitted,
      correct_count: total_correct,
      total_score,
      total_possible,
      by_chapter,
    });
    setLoading(false);
  };

  if (loading) return <div className="container" style={{ textAlign: "center", paddingTop: "40px" }}>Loading...</div>;
  if (!progress) return <div className="container" style={{ textAlign: "center", paddingTop: "40px" }}>No data</div>;

  const completionPct = Math.round((progress.submitted_count / progress.total_questions) * 100);
  const scorePct = progress.total_possible > 0 ? Math.round((progress.total_score / progress.total_possible) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <h1>
          <span className="logo-mark">ACCT 2101</span>
          Progress
        </h1>
        <div className="page-header-nav">
          <Link href="/student" className="btn btn-ghost-navy" style={{ padding: "8px 16px", fontSize: "14px" }}>
            ← Back to Homework
          </Link>
        </div>
      </div>

      <div className="container">
        {/* Summary Stats */}
        <div className="stats-grid" style={{ marginBottom: "40px" }}>
          <div className="stat-card">
            <div className="stat-number">{completionPct}%</div>
            <div className="stat-label">Completion Rate</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 0 0" }}>
              {progress.submitted_count} of {progress.total_questions} submitted
            </p>
          </div>

          <div className="stat-card">
            <div className="stat-number">{scorePct}%</div>
            <div className="stat-label">Overall Score</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 0 0" }}>
              {progress.total_score} of {progress.total_possible} points
            </p>
          </div>

          <div className="stat-card">
            <div className="stat-number">{progress.correct_count}</div>
            <div className="stat-label">Correct Answers</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 0 0" }}>
              out of {progress.submitted_count} submitted
            </p>
          </div>

          <div className="stat-card">
            <div className="stat-number">{progress.total_questions}</div>
            <div className="stat-label">Total Questions</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 0 0" }}>
              across {progress.by_chapter.length} chapter{progress.by_chapter.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Chapter Breakdown */}
        <h2 style={{ marginBottom: "24px" }}>Chapter Breakdown</h2>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Chapter</th>
                <th>Progress</th>
                <th>Submitted</th>
                <th>Correct</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {progress.by_chapter.map(ch => {
                const chProgress = ch.total > 0 ? Math.round((ch.submitted / ch.total) * 100) : 0;
                return (
                  <tr key={ch.chapter}>
                    <td><strong>Chapter {ch.chapter}</strong></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <progress value={ch.submitted} max={ch.total} style={{ width: "80px" }} />
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{chProgress}%</span>
                      </div>
                    </td>
                    <td>{ch.submitted} / {ch.total}</td>
                    <td style={{ color: ch.correct > 0 ? "var(--green)" : "var(--text-muted)" }}>{ch.correct}</td>
                    <td><strong>{ch.score} / {ch.possible}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
