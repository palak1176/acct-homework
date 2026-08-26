"use client";
import { createClient } from "@/lib/supabase-client";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Question, Submission, MatchPair, GridData } from "@/lib/types";
import { isNumericMatch, gridCellKey } from "@/lib/grid";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const chapters = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12];

export default function StudentPage() {
  const supabase = createClient();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isTA, setIsTA] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, Submission>>(new Map());
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [matchAnswers, setMatchAnswers] = useState<Record<string, string>>({});
  const [matchRightOptions, setMatchRightOptions] = useState<string[]>([]);
  const [gridAnswers, setGridAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ is_correct: boolean | null; score: number | null; explanation: string | null; correct_answer: string | null; student_answer: string | null } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterChapter, setFilterChapter] = useState<number | null>(null);
  const [needsGtEmail, setNeedsGtEmail] = useState(false);
  const [gtEmailInput, setGtEmailInput] = useState("");
  const [gtEmailError, setGtEmailError] = useState<string | null>(null);
  const [savingGtEmail, setSavingGtEmail] = useState(false);

  useEffect(() => { checkAccess(); }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: userRow } = await supabase.from("users").select("role, gt_email").eq("id", user.id).single();
    if (!userRow) {
      router.replace("/login");
      return;
    }

    setAuthorized(true);
    setIsTA(userRow.role === "ta");
    if (userRow.role === "student" && !userRow.gt_email) {
      setNeedsGtEmail(true);
    }
    loadData();
  };

  const submitGtEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGtEmail(true);
    setGtEmailError(null);
    const res = await fetch("/api/gt-email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gt_email: gtEmailInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setGtEmailError(data.error || "Failed to save.");
    } else {
      setNeedsGtEmail(false);
    }
    setSavingGtEmail(false);
  };

  const resetSubmission = async (q: Question) => {
    if (!confirm(`Reset your submission for "${q.title}"? This can't be undone.`)) return;
    setResetting(q.id);
    const res = await fetch("/api/reset-submission", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: q.id }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to reset submission");
    } else {
      await loadData();
    }
    setResetting(null);
  };

  const loadData = async () => {
    const { data } = await supabase.from("questions_public").select("*").order("chapter").order("order_index");
    if (data) setQuestions(data as Question[]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: subs } = await supabase.from("submissions").select("*").eq("user_id", user.id);
    if (subs) {
      const map = new Map<string, Submission>();
      subs.forEach((s: any) => map.set(s.question_id, s));
      setSubmissions(map);
    }
  };

  const viewResult = async (q: Question) => {
    try {
      const res = await fetch(`/api/submission-result?question_id=${q.id}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to load result");
        return;
      }
      setStudentAnswer("");
      setGridAnswers({});
      setSubmitError(null);
      setFeedback(data);
      setSelectedQuestion(q);
    } catch {
      alert("Failed to load result");
    }
  };

  const isMatchType = selectedQuestion?.type === "matching";
  const matchPairCount = Array.isArray(selectedQuestion?.options) ? (selectedQuestion!.options as MatchPair[]).length : 0;
  const matchComplete = isMatchType && Object.keys(matchAnswers).length === matchPairCount && matchPairCount > 0;

  const isGridType = selectedQuestion?.type === "grid";
  const gridData = isGridType && selectedQuestion?.options && !Array.isArray(selectedQuestion.options)
    ? (selectedQuestion.options as GridData)
    : null;
  const gridBlankKeys = gridData
    ? gridData.rows.flatMap((row, rIdx) => row.cells.map((cell, cIdx) => (cell === null ? gridCellKey(rIdx, cIdx) : null)).filter((k): k is string => k !== null))
    : [];
  const gridComplete = isGridType && gridBlankKeys.length > 0 && gridBlankKeys.every(k => (gridAnswers[k] ?? "").trim() !== "");

  const submitAnswer = async () => {
    if (!selectedQuestion) return;
    const answerToSend = isMatchType ? JSON.stringify(matchAnswers) : isGridType ? JSON.stringify(gridAnswers) : studentAnswer;
    if (isMatchType ? !matchComplete : isGridType ? !gridComplete : !studentAnswer) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: selectedQuestion.id, answer: answerToSend }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error || "Failed to submit answer");
      setSubmitting(false);
      return;
    }
    setFeedback(data);
    setSubmitting(false);
    loadData();
  };

  const filteredQuestions = filterChapter ? questions.filter(q => q.chapter === filterChapter) : questions;

  if (!authorized) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;

  if (needsGtEmail) {
    return (
      <div style={{ maxWidth: "420px", margin: "80px auto", padding: "24px" }}>
        <div className="question-card">
          <h2 style={{ marginBottom: "8px" }}>One more thing</h2>
          <p style={{ marginBottom: "16px", color: "var(--text)" }}>
            Please enter your Georgia Tech email so we can match your homework records.
          </p>
          <form onSubmit={submitGtEmail}>
            <input
              type="email"
              placeholder="yourname@gatech.edu"
              value={gtEmailInput}
              onChange={e => setGtEmailInput(e.target.value)}
              required
              style={{ width: "100%", boxSizing: "border-box", marginBottom: "12px" }}
            />
            {gtEmailError && (
              <p style={{ color: "var(--red)", marginBottom: "12px", fontSize: "14px" }}>{gtEmailError}</p>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={savingGtEmail}>
              {savingGtEmail ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1><span className="logo-mark">ACCT 2101</span> Homework</h1>
        <div className="page-header-nav">
          <Link href="/progress" className="btn btn-ghost-navy" style={{ padding: "8px 16px", fontSize: "14px" }}>Progress</Link>
        </div>
      </div>

      <div className="container">
        <h2 style={{ marginBottom: "20px" }}>Homework</h2>
        <div className="filter-tabs">
          <button className={`tab ${filterChapter === null ? "active" : ""}`} onClick={() => setFilterChapter(null)}>All Chapters</button>
          {chapters.map(ch => (
            <button key={ch} className={`tab ${filterChapter === ch ? "active" : ""}`} onClick={() => setFilterChapter(ch)}>Ch {ch}</button>
          ))}
        </div>

        <div style={{ display: "grid", gap: "16px", marginBottom: "40px" }}>
          {filteredQuestions.map(q => {
            const submitted = submissions.has(q.id);
            const now = new Date();
            const dueDate = q.due_at ? new Date(q.due_at) : null;
            const pastDue = dueDate ? now > dueDate : false;
            const dueSoon = dueDate && !pastDue ? dueDate.getTime() - now.getTime() <= 24 * 60 * 60 * 1000 : false;
            const available = !q.available_at || new Date(q.available_at) <= now;
            const clickable = submitted ? true : available && !pastDue;
            const onCardClick = submitted
              ? () => viewResult(q)
              : clickable
              ? () => {
                  setSelectedQuestion(q);
                  setFeedback(null);
                  setSubmitError(null);
                  setStudentAnswer("");
                  setMatchAnswers({});
                  setGridAnswers({});
                  if (q.type === "matching" && Array.isArray(q.options)) {
                    const uniqueRights = Array.from(new Set((q.options as MatchPair[]).map(p => p.right)));
                    setMatchRightOptions(shuffle(uniqueRights));
                  } else {
                    setMatchRightOptions([]);
                  }
                }
              : undefined;
            return (
              <div
                key={q.id}
                className={`question-card ${submitted ? "submitted" : ""}`}
                style={{ cursor: clickable ? "pointer" : "default", opacity: !submitted && (!available || pastDue) ? 0.6 : 1 }}
                onClick={onCardClick}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="question-title">{q.title}</div>
                    <p style={{ margin: "8px 0 12px 0", color: "var(--text)", fontSize: "14px" }}>{q.prompt}</p>
                    <div className="question-meta">
                      <span className="badge badge-chapter">Ch {q.chapter}</span>
                      {submitted && <span className="badge badge-submitted">✓ Submitted</span>}
                      {!submitted && !available && (
                        <span className="badge" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>Not Yet Available</span>
                      )}
                      {!submitted && available && pastDue && (
                        <span className="badge" style={{ backgroundColor: "var(--red)", color: "var(--surface)" }}>Past Due</span>
                      )}
                      {!submitted && available && !pastDue && dueSoon && (
                        <span className="badge" style={{ backgroundColor: "#ffc107", color: "var(--navy)" }}>Due Soon</span>
                      )}
                      {!submitted && !available && q.available_at && (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          Opens {new Date(q.available_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}
                      {q.due_at && (
                        <span style={{ fontSize: "12px", color: dueSoon || pastDue ? "var(--red)" : "var(--text-muted)", fontWeight: dueSoon || pastDue ? 600 : 400 }}>
                          Due {new Date(q.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                  {submitted ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginLeft: "16px" }}>
                      <button className="btn btn-ghost" style={{ minWidth: "100px", fontSize: "13px" }}>
                        View Result
                      </button>
                      {isTA && (
                        <button
                          className="btn btn-ghost"
                          disabled={resetting === q.id}
                          onClick={e => { e.stopPropagation(); resetSubmission(q); }}
                          style={{ minWidth: "100px", fontSize: "13px", color: "var(--red)" }}
                        >
                          {resetting === q.id ? "Resetting..." : "Reset"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button className="btn btn-primary" disabled={!clickable} style={{ marginLeft: "16px", minWidth: "100px", fontSize: "13px" }}>
                      Answer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredQuestions.length === 0 && <p style={{ color: "var(--text-muted)" }}>No questions yet.</p>}
        </div>
      </div>

      {selectedQuestion && (
        <div className="modal-overlay" onClick={() => setSelectedQuestion(null)}>
          <div className="modal-box" style={isMatchType || isGridType ? { maxWidth: "720px" } : undefined} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ marginBottom: "4px" }}>{selectedQuestion.title}</h2>
                <p style={{ margin: "0", color: "var(--text-muted)", fontSize: "14px" }}>
                  Chapter {selectedQuestion.chapter}
                  {selectedQuestion.due_at && ` · Due ${new Date(selectedQuestion.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
                </p>
              </div>
            </div>
            <div className="modal-content">
              <p style={{ color: "var(--text)", lineHeight: "1.6" }}>{selectedQuestion.prompt}</p>
              {!feedback ? (
                <>
                  {submitError && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--red-light)", borderLeft: "4px solid var(--red)", marginBottom: "16px" }}>
                      <p style={{ margin: "0", color: "var(--red)", fontWeight: "600" }}>{submitError}</p>
                    </div>
                  )}
                  {selectedQuestion.type === "text" || selectedQuestion.type === "fill_blank" ? (
                    <textarea value={studentAnswer} onChange={e => setStudentAnswer(e.target.value)} placeholder="Your answer..." style={{ width: "100%", boxSizing: "border-box", marginBottom: "16px" }} />
                  ) : selectedQuestion.type === "multiple_choice" && selectedQuestion.options ? (
                    <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(selectedQuestion.options as any[]).map((opt, idx) => (
                        <label key={idx} style={{ display: "flex", alignItems: "center", padding: "10px", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", backgroundColor: studentAnswer === opt ? "var(--green-light)" : "transparent" }}>
                          <input type="radio" name="mc" value={opt} checked={studentAnswer === opt} onChange={e => setStudentAnswer(e.target.value)} style={{ marginRight: "12px" }} />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : isMatchType && Array.isArray(selectedQuestion.options) ? (
                    <div
                      style={{
                        marginBottom: "16px",
                        display: "grid",
                        gridTemplateColumns: "minmax(100px, max-content) 1fr",
                        rowGap: "8px",
                        columnGap: 0,
                      }}
                    >
                      {(selectedQuestion.options as MatchPair[]).map(pair => (
                        <Fragment key={pair.id}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "12px 14px",
                              border: "1px solid var(--border)",
                              borderRight: "none",
                              borderRadius: "8px 0 0 8px",
                              backgroundColor: matchAnswers[pair.id] ? "rgba(201, 162, 39, 0.1)" : "transparent",
                              fontSize: "14px",
                              fontWeight: 600,
                              lineHeight: 1.4,
                              maxWidth: "280px",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {pair.left}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: "0 8px 8px 0",
                              backgroundColor: matchAnswers[pair.id] ? "rgba(201, 162, 39, 0.1)" : "transparent",
                            }}
                          >
                            <select
                              value={matchAnswers[pair.id] || ""}
                              onChange={e => setMatchAnswers(current => ({ ...current, [pair.id]: e.target.value }))}
                              style={{ width: "100%" }}
                            >
                              <option value="" disabled>Select a match...</option>
                              {matchRightOptions.map((opt, idx) => (
                                <option key={idx} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  ) : isGridType && gridData ? (
                    <div style={{ overflowX: "auto", marginBottom: "16px" }}>
                      <table>
                        <thead>
                          <tr>
                            <th></th>
                            {gridData.columns.map((col, cIdx) => <th key={cIdx}>{col}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {gridData.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td style={{ fontWeight: 600 }}>{row.label}</td>
                              {row.cells.map((cell, cIdx) => {
                                if (cell !== null) {
                                  return <td key={cIdx}>{cell}</td>;
                                }
                                const key = gridCellKey(rIdx, cIdx);
                                return (
                                  <td key={cIdx}>
                                    <input
                                      type="text"
                                      value={gridAnswers[key] || ""}
                                      onChange={e => setGridAnswers(current => ({ ...current, [key]: e.target.value }))}
                                      placeholder="?"
                                      style={{ width: "100%", boxSizing: "border-box" }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <button
                    onClick={submitAnswer}
                    disabled={submitting || (isMatchType ? !matchComplete : isGridType ? !gridComplete : !studentAnswer)}
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                  >
                    {submitting ? "Submitting..." : "Submit Answer"}
                  </button>
                </>
              ) : (
                <>
                  {feedback.student_answer !== null && feedback.student_answer !== undefined && (() => {
                    const answerColor = feedback.is_correct === true ? "var(--green)" : feedback.is_correct === false ? "var(--red)" : undefined;
                    const answerBg = feedback.is_correct === true ? "var(--green-light)" : feedback.is_correct === false ? "var(--red-light)" : undefined;
                    return (
                      <div className="answer-block" style={{ backgroundColor: answerBg, borderLeftColor: answerColor }}>
                        <h3 style={{ color: answerColor }}>Your Answer</h3>
                        {isMatchType && Array.isArray(selectedQuestion.options) ? (
                          <div
                            className="answer-text"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(120px, 1fr) minmax(160px, 1.4fr)",
                              rowGap: "8px",
                              columnGap: "16px",
                              color: answerColor,
                            }}
                          >
                            {(() => {
                              let studentMap: Record<string, string> = {};
                              try { studentMap = JSON.parse(feedback.student_answer || "{}"); } catch { studentMap = {}; }
                              return (selectedQuestion.options as MatchPair[]).map(pair => (
                                <Fragment key={pair.id}>
                                  <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{pair.left}</span>
                                  <span style={{ textAlign: "right" }}>{studentMap[pair.id] ?? "(no answer)"}</span>
                                </Fragment>
                              ));
                            })()}
                          </div>
                        ) : isGridType && gridData ? (
                          <div style={{ overflowX: "auto" }}>
                            <table>
                              <thead>
                                <tr>
                                  <th></th>
                                  {gridData.columns.map((col, cIdx) => <th key={cIdx}>{col}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  let studentMap: Record<string, string> = {};
                                  let correctMap: Record<string, string> = {};
                                  try { studentMap = JSON.parse(feedback.student_answer || "{}"); } catch { studentMap = {}; }
                                  try { correctMap = JSON.parse(feedback.correct_answer || "{}"); } catch { correctMap = {}; }
                                  return gridData.rows.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                      <td style={{ fontWeight: 600 }}>{row.label}</td>
                                      {row.cells.map((cell, cIdx) => {
                                        if (cell !== null) return <td key={cIdx}>{cell}</td>;
                                        const key = gridCellKey(rIdx, cIdx);
                                        const studentValue = studentMap[key];
                                        const cellCorrect = isNumericMatch(studentValue, correctMap[key]);
                                        return (
                                          <td key={cIdx} style={{ color: cellCorrect ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                                            {studentValue || "(no answer)"}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="answer-text" style={{ color: answerColor }}>{feedback.student_answer}</div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="answer-block">
                    <h3>Correct Answer</h3>
                    {isMatchType && Array.isArray(selectedQuestion.options) ? (
                      <div
                        className="answer-text"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(120px, 1fr) minmax(160px, 1.4fr)",
                          rowGap: "8px",
                          columnGap: "16px",
                        }}
                      >
                        {(() => {
                          let correctMap: Record<string, string> = {};
                          try { correctMap = JSON.parse(feedback.correct_answer || "{}"); } catch { correctMap = {}; }
                          return (selectedQuestion.options as MatchPair[]).map(pair => (
                            <Fragment key={pair.id}>
                              <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{pair.left}</span>
                              <span style={{ textAlign: "right" }}>{correctMap[pair.id] ?? pair.right}</span>
                            </Fragment>
                          ));
                        })()}
                      </div>
                    ) : isGridType && gridData ? (
                      <div style={{ overflowX: "auto" }}>
                        <table>
                          <thead>
                            <tr>
                              <th></th>
                              {gridData.columns.map((col, cIdx) => <th key={cIdx}>{col}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let correctMap: Record<string, string> = {};
                              try { correctMap = JSON.parse(feedback.correct_answer || "{}"); } catch { correctMap = {}; }
                              return gridData.rows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  <td style={{ fontWeight: 600 }}>{row.label}</td>
                                  {row.cells.map((cell, cIdx) => {
                                    if (cell !== null) return <td key={cIdx}>{cell}</td>;
                                    const key = gridCellKey(rIdx, cIdx);
                                    return <td key={cIdx}>{correctMap[key] ?? "?"}</td>;
                                  })}
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="answer-text">{feedback.correct_answer}</div>
                    )}
                  </div>
                  {(feedback.explanation || selectedQuestion.explanation) && (
                    <div className="explanation-block">
                      <h3>Explanation</h3>
                      <p className="explanation-text">{feedback.explanation || selectedQuestion.explanation}</p>
                    </div>
                  )}
                  {(isMatchType || isGridType) && feedback.score !== null && (
                    <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: "0 0 4px 0" }}>
                      Score: {feedback.score} / {selectedQuestion.points ?? 1}
                    </p>
                  )}
                  {isGridType && feedback.correct_answer && feedback.student_answer && (() => {
                    let studentMap: Record<string, string> = {};
                    let correctMap: Record<string, string> = {};
                    try { studentMap = JSON.parse(feedback.student_answer); } catch { studentMap = {}; }
                    try { correctMap = JSON.parse(feedback.correct_answer); } catch { correctMap = {}; }
                    const keys = Object.keys(correctMap);
                    const matches = keys.filter(k => isNumericMatch(studentMap[k], correctMap[k])).length;
                    return (
                      <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
                        {matches} of {keys.length} blanks correct
                      </p>
                    );
                  })()}
                  {feedback.is_correct !== null && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: feedback.is_correct ? "var(--green-light)" : "var(--red-light)", borderLeft: `4px solid ${feedback.is_correct ? "var(--green)" : "var(--red)"}`, marginBottom: "16px" }}>
                      <p style={{ margin: "0", color: feedback.is_correct ? "var(--green)" : "var(--red)", fontWeight: "600" }}>
                        {feedback.is_correct ? "✓ Correct!" : (isMatchType || isGridType) && feedback.score ? "Partial credit awarded" : "✗ Incorrect"}
                      </p>
                    </div>
                  )}
                  <button onClick={() => setSelectedQuestion(null)} className="btn btn-ghost" style={{ width: "100%" }}>Close</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}