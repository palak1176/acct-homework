"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Question, MatchPair, GridData, GridRow } from "@/lib/types";

type GridCellEditor = { blank: boolean; value: string };
type GridRowEditor = { label: string; cells: GridCellEditor[] };

const chapters = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12];

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parsePairs(text: string): MatchPair[] {
  return text
    .split("\n")
    .map(line => {
      const [left, right] = line.split("|").map(s => s.trim());
      return { left, right };
    })
    .filter(p => p.left && p.right)
    .map((p, i) => ({ id: String(i), ...p }));
}

export default function InstructorPage() {
  const supabase = createClient();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [chapter, setChapter] = useState(1);
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [pairs, setPairs] = useState("");
  const [gridColumns, setGridColumns] = useState<string[]>([]);
  const [gridColumnInput, setGridColumnInput] = useState("");
  const [gridRows, setGridRows] = useState<GridRowEditor[]>([]);
  const [gridRowLabelInput, setGridRowLabelInput] = useState("");
  const [filterChapter, setFilterChapter] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [bulkAvailableAt, setBulkAvailableAt] = useState("");
  const [bulkDueAt, setBulkDueAt] = useState("");
  const [applyingBulkSchedule, setApplyingBulkSchedule] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submissionCounts, setSubmissionCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => { checkAccess(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  };

  const dragStateRef = useRef({ draggedId, questions, filterChapter });
  useEffect(() => {
    dragStateRef.current = { draggedId, questions, filterChapter };
  });

  useEffect(() => {
    const handleMouseUp = async () => {
      const { draggedId, questions, filterChapter } = dragStateRef.current;
      if (!draggedId || filterChapter === null) {
        setDraggedId(null);
        return;
      }

      setDraggedId(null);

      const chapterQuestions = questions.filter(q => q.chapter === filterChapter);
      await Promise.all(
        chapterQuestions.map((q, i) =>
          fetch("/api/questions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: q.id, order_index: i }),
          })
        )
      );

      await loadQuestions();
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleDragEnter = (targetId: string) => {
    if (!draggedId || draggedId === targetId || filterChapter === null) return;

    setQuestions(current => {
      const chapterQuestions = current.filter(q => q.chapter === filterChapter);
      const otherQuestions = current.filter(q => q.chapter !== filterChapter);

      const fromIndex = chapterQuestions.findIndex(q => q.id === draggedId);
      const toIndex = chapterQuestions.findIndex(q => q.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return current;

      const reordered = [...chapterQuestions];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      return [...otherQuestions, ...reordered];
    });
  };

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!userRow || userRow.role !== "ta") {
      router.replace("/student");
      return;
    }

    setAuthorized(true);
    loadQuestions();
  };

  const loadQuestions = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("chapter")
      .order("order_index");

    console.log("[INSTRUCTOR] Questions data:", data);
    console.log("[INSTRUCTOR] Questions error:", error);

    if (error) {
      console.error("[INSTRUCTOR] Failed to load questions:", error);
      return;
    }

    if (data) {
      setQuestions(data as Question[]);
    }

    const { data: subs } = await supabase.from("submissions").select("question_id");
    if (subs) {
      const counts = new Map<string, number>();
      subs.forEach((s: any) => counts.set(s.question_id, (counts.get(s.question_id) || 0) + 1));
      setSubmissionCounts(counts);
    }
  };

  const resetGridEditor = () => {
    setGridColumns([]);
    setGridColumnInput("");
    setGridRows([]);
    setGridRowLabelInput("");
  };

  const addGridColumn = () => {
    const label = gridColumnInput.trim();
    if (!label) return;
    setGridColumns(current => [...current, label]);
    setGridRows(current => current.map(r => ({ ...r, cells: [...r.cells, { blank: false, value: "" }] })));
    setGridColumnInput("");
  };

  const removeGridColumn = (colIdx: number) => {
    setGridColumns(current => current.filter((_, i) => i !== colIdx));
    setGridRows(current => current.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== colIdx) })));
  };

  const updateGridColumnLabel = (colIdx: number, label: string) => {
    setGridColumns(current => current.map((c, i) => (i === colIdx ? label : c)));
  };

  const addGridRow = () => {
    const label = gridRowLabelInput.trim() || String.fromCharCode(65 + gridRows.length);
    setGridRows(current => [...current, { label, cells: gridColumns.map(() => ({ blank: false, value: "" })) }]);
    setGridRowLabelInput("");
  };

  const removeGridRow = (rowIdx: number) => {
    setGridRows(current => current.filter((_, i) => i !== rowIdx));
  };

  const updateGridRowLabel = (rowIdx: number, label: string) => {
    setGridRows(current => current.map((r, i) => (i === rowIdx ? { ...r, label } : r)));
  };

  const updateGridCell = (rowIdx: number, colIdx: number, patch: Partial<GridCellEditor>) => {
    setGridRows(current =>
      current.map((r, i) =>
        i === rowIdx
          ? { ...r, cells: r.cells.map((c, j) => (j === colIdx ? { ...c, ...patch } : c)) }
          : r
      )
    );
  };

  const validateGrid = (): string | null => {
    if (gridColumns.length === 0) return "Add at least one column.";
    if (gridRows.length === 0) return "Add at least one row.";
    let hasBlank = false;
    for (const row of gridRows) {
      for (const cell of row.cells) {
        if (cell.blank) {
          hasBlank = true;
          if (!cell.value.trim()) return "Every blank cell needs a correct answer.";
        } else if (cell.value.trim() === "" || Number.isNaN(parseFloat(cell.value))) {
          return "Every non-blank cell needs a numeric value.";
        }
      }
    }
    if (!hasBlank) return "Mark at least one cell as blank for students to fill in.";
    return null;
  };

  const buildGridPayload = (): { options: GridData; correct_answer: string } => {
    const correctMap: Record<string, string> = {};
    const rows: GridRow[] = gridRows.map((row, rIdx) => ({
      label: row.label,
      cells: row.cells.map((cell, cIdx) => {
        if (cell.blank) {
          correctMap[`${rIdx}-${cIdx}`] = cell.value.trim();
          return null;
        }
        const num = parseFloat(cell.value);
        return Number.isNaN(num) ? null : num;
      }),
    }));
    return { options: { columns: gridColumns, rows }, correct_answer: JSON.stringify(correctMap) };
  };

  const editQuestion = async (q: Question) => {
    setEditingId(q.id);

    setTitle(q.title || "");
    setPrompt(q.prompt || "");
    setAnswer(q.correct_answer || "");
    setExplanation(q.explanation || "");
    setChapter(q.chapter || 1);
    setType(q.type || "text");

    if (q.type === "matching") {
      setOptions("");
      setPairs(
        Array.isArray(q.options)
          ? (q.options as MatchPair[]).map(p => `${p.left} | ${p.right}`).join("\n")
          : ""
      );
    } else if (Array.isArray(q.options)) {
      setOptions(q.options.join("\n"));
      setPairs("");
    } else {
      setOptions("");
      setPairs("");
    }

    if (q.type === "grid" && q.options && !Array.isArray(q.options)) {
      const gridData = q.options as GridData;
      let correctMap: Record<string, string> = {};
      try { correctMap = JSON.parse(q.correct_answer || "{}"); } catch { correctMap = {}; }
      setGridColumns(gridData.columns || []);
      setGridRows(
        (gridData.rows || []).map((row, rIdx) => ({
          label: row.label,
          cells: row.cells.map((cell, cIdx) => {
            const key = `${rIdx}-${cIdx}`;
            return cell === null
              ? { blank: true, value: correctMap[key] ?? "" }
              : { blank: false, value: String(cell) };
          }),
        }))
      );
    } else {
      resetGridEditor();
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const saveEdit = async () => {
    const isMatchType = type === "matching";
    const isGridType = type === "grid";
    const parsedPairs = isMatchType ? parsePairs(pairs) : [];

    if (!editingId || !title || !prompt) return;
    if (isGridType) {
      const gridError = validateGrid();
      if (gridError) { showToast(gridError, "error"); return; }
    } else if (isMatchType ? parsedPairs.length < 2 : !answer) {
      return;
    }

    setSavingEdit(true);

    try {
      const gridPayload = isGridType ? buildGridPayload() : null;
      const response = await fetch("/api/questions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          title,
          prompt,
          correct_answer: isGridType
            ? gridPayload!.correct_answer
            : isMatchType
              ? JSON.stringify(Object.fromEntries(parsedPairs.map(p => [p.id, p.right])))
              : answer,
          explanation,
          chapter,
          type,
          options: isGridType
            ? gridPayload!.options
            : isMatchType
              ? parsedPairs
              : type === "multiple_choice"
                ? options.split("\n").filter(Boolean)
                : null,
        }),
      });

      const result = await response.json();

      console.log("[INSTRUCTOR] Edit response:", result);

      if (!response.ok) {
        throw new Error(result.error || "Failed to update question");
      }

      // Clear edit mode
      setEditingId(null);
      setTitle("");
      setPrompt("");
      setAnswer("");
      setExplanation("");
      setOptions("");
      setPairs("");
      resetGridEditor();

      showToast("Question updated");
      await loadQuestions();
    } catch (error) {
      console.error("[INSTRUCTOR] Edit failed:", error);

      showToast(
        error instanceof Error ? error.message : "Failed to update question",
        "error"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const selectChapterTab = (ch: number | null) => {
    setFilterChapter(ch);

    if (ch === null) {
      setBulkAvailableAt("");
      setBulkDueAt("");
      return;
    }

    const chapterQuestions = questions.filter(q => q.chapter === ch);
    const existingAvailableAt = chapterQuestions.find(q => q.available_at)?.available_at;
    const existingDueAt = chapterQuestions.find(q => q.due_at)?.due_at;
    setBulkAvailableAt(toDatetimeLocal(existingAvailableAt));
    setBulkDueAt(toDatetimeLocal(existingDueAt));
  };

  const applyBulkSchedule = async () => {
    if (filterChapter === null || (!bulkAvailableAt && !bulkDueAt)) return;

    setApplyingBulkSchedule(true);

    try {
      const chapterQuestions = questions.filter(q => q.chapter === filterChapter);
      const body: { available_at?: string; due_at?: string } = {};
      if (bulkAvailableAt) body.available_at = new Date(bulkAvailableAt).toISOString();
      if (bulkDueAt) body.due_at = new Date(bulkDueAt).toISOString();

      await Promise.all(
        chapterQuestions.map(q =>
          fetch("/api/questions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: q.id, ...body }),
          })
        )
      );

      showToast(`Schedule applied to Chapter ${filterChapter}`);
      await loadQuestions();
    } catch (error) {
      console.error("[INSTRUCTOR] Bulk schedule failed:", error);
      showToast("Failed to apply schedule to chapter", "error");
    } finally {
      setApplyingBulkSchedule(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget.id);

    try {
      const response = await fetch(
        `/api/questions?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete question");
      }

      setQuestions(current => current.filter(q => q.id !== deleteTarget.id));
      showToast(`Deleted "${deleteTarget.title}"`);
      setDeleteTarget(null);
      await loadQuestions();
    } catch (error) {
      console.error("[INSTRUCTOR] Delete failed:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to delete question",
        "error"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const createQuestion = async () => {
    const isMatchType = type === "matching";
    const isGridType = type === "grid";
    const parsedPairs = isMatchType ? parsePairs(pairs) : [];

    if (!title || !prompt) return;
    if (isGridType) {
      const gridError = validateGrid();
      if (gridError) { showToast(gridError, "error"); return; }
    } else if (isMatchType ? parsedPairs.length < 2 : !answer) {
      return;
    }

    setCreating(true);

    try {
      const gridPayload = isGridType ? buildGridPayload() : null;
      const response = await fetch("/api/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          prompt,
          correct_answer: isGridType
            ? gridPayload!.correct_answer
            : isMatchType
              ? JSON.stringify(Object.fromEntries(parsedPairs.map(p => [p.id, p.right])))
              : answer,
          explanation,
          chapter,
          type,
          options: isGridType
            ? gridPayload!.options
            : isMatchType
              ? parsedPairs
              : type === "multiple_choice"
                ? options.split("\n").filter(Boolean)
                : null,
        }),
      });

      const result = await response.json();

      console.log("[INSTRUCTOR] Create question response:", result);

      if (!response.ok) {
        throw new Error(result.error || "Failed to create question");
      }

      // Only clear the form after successful creation
      setTitle("");
      setPrompt("");
      setAnswer("");
      setExplanation("");
      setOptions("");
      setPairs("");
      resetGridEditor();

      showToast("Question created");
      // Reload questions
      await loadQuestions();
    } catch (error) {
      console.error("[INSTRUCTOR] Failed to create question:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to create question",
        "error"
      );
    } finally {
      setCreating(false);
    }
  };

  if (!authorized) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;

  const isMatchType = type === "matching";
  const isGridType = type === "grid";
  const questionChapters = Array.from(new Set(questions.map(q => q.chapter))).sort((a, b) => a - b);
  const filteredQuestions = filterChapter ? questions.filter(q => q.chapter === filterChapter) : questions;


  return (
    <div>
      <div className="page-header">
        <h1><span className="logo-mark">ACCT 2101</span> Instructor View</h1>
        <div className="page-header-nav">
          <Link href="/analytics" className="btn btn-ghost-navy" style={{ padding: "8px 16px", fontSize: "14px" }}>Analytics</Link>
          <Link href="/student" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "14px" }}>Student View →</Link>
        </div>
      </div>

      <div className="container">
        <div style={{ marginBottom: "40px" }}>
          <h2>{editingId ? "Edit Question" : "Create Question"}</h2>
          <div className="card" style={{ padding: "24px" }}>
            <div className="form-row">
              <div className="form-group">
                <label>Title</label>
                <input type="text" placeholder="e.g., Journal Entry Practice" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Chapter</label>
                <select value={chapter} onChange={e => setChapter(parseInt(e.target.value))}>
                  {chapters.map(ch => <option key={ch} value={ch}>Chapter {ch}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Prompt</label>
              <textarea placeholder="What do you want students to answer?" value={prompt} onChange={e => setPrompt(e.target.value)} />
            </div>
            {!isMatchType && !isGridType && (
              <div className="form-group">
                <label>Correct Answer</label>
                <textarea placeholder="Debit Cash 1000, Credit Revenue 1000" value={answer} onChange={e => setAnswer(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label>Explanation (Optional)</label>
              <textarea placeholder="Why is this the correct answer?" value={explanation} onChange={e => setExplanation(e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Question Type</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option value="text">Text Answer</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="matching">Matching</option>
                  <option value="grid">Grid (Table)</option>
                </select>
              </div>
            </div>
            {type === "multiple_choice" && (
              <div className="form-group">
                <label>Options (one per line)</label>
                <textarea placeholder="Option A&#10;Option B&#10;Option C" value={options} onChange={e => setOptions(e.target.value)} />
              </div>
            )}
            {isMatchType && (
              <div className="form-group">
                <label>Pairs (one per line, {`left | right`})</label>
                <textarea
                  placeholder="Asset | Debit&#10;Liability | Credit"
                  value={pairs}
                  onChange={e => setPairs(e.target.value)}
                />
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "6px 0 0 0" }}>
                  Students see the left side and pick the matching right-side value from a dropdown. Partial credit is awarded per correct pair.
                </p>
              </div>
            )}
            {isGridType && (
              <div className="form-group">
                <label>Grid Columns</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                  {gridColumns.map((col, cIdx) => (
                    <div key={cIdx} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="text"
                        value={col}
                        onChange={e => updateGridColumnLabel(cIdx, e.target.value)}
                        style={{ width: "160px" }}
                      />
                      <button type="button" onClick={() => removeGridColumn(cIdx)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "12px" }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <input
                    type="text"
                    placeholder="New column label (e.g., Net Income)"
                    value={gridColumnInput}
                    onChange={e => setGridColumnInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addGridColumn(); } }}
                  />
                  <button type="button" onClick={addGridColumn} className="btn btn-secondary" style={{ whiteSpace: "nowrap" }}>Add Column</button>
                </div>

                {gridColumns.length > 0 && (
                  <>
                    <label>Rows</label>
                    <div style={{ overflowX: "auto", marginBottom: "12px" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Row</th>
                            {gridColumns.map((col, cIdx) => <th key={cIdx}>{col}</th>)}
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {gridRows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td>
                                <input type="text" value={row.label} onChange={e => updateGridRowLabel(rIdx, e.target.value)} style={{ width: "80px" }} />
                              </td>
                              {row.cells.map((cell, cIdx) => (
                                <td key={cIdx} style={{ backgroundColor: cell.blank ? "rgba(201, 162, 39, 0.12)" : undefined }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <input
                                      type="text"
                                      value={cell.value}
                                      placeholder={cell.blank ? "Correct answer" : "Given value"}
                                      onChange={e => updateGridCell(rIdx, cIdx, { value: e.target.value })}
                                      style={{ width: "110px" }}
                                    />
                                    <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                                      <input
                                        type="checkbox"
                                        checked={cell.blank}
                                        onChange={e => updateGridCell(rIdx, cIdx, { blank: e.target.checked })}
                                      />
                                      Blank for student
                                    </label>
                                  </div>
                                </td>
                              ))}
                              <td>
                                <button type="button" onClick={() => removeGridRow(rIdx)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "12px" }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                      <input
                        type="text"
                        placeholder={`Row label (e.g., ${String.fromCharCode(65 + gridRows.length)})`}
                        value={gridRowLabelInput}
                        onChange={e => setGridRowLabelInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addGridRow(); } }}
                      />
                      <button type="button" onClick={addGridRow} className="btn btn-secondary" style={{ whiteSpace: "nowrap" }}>Add Row</button>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
                      Check "Blank for student" on a cell and enter its correct answer instead of a given value. Students see given values as plain text and blank cells as fillable inputs, graded per cell.
                    </p>
                  </>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              {editingId ? (
                <>
                  <button
                    onClick={saveEdit}
                    disabled={savingEdit}
                    className="btn btn-primary"
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    onClick={() => {
                      setEditingId(null);
                      setTitle("");
                      setPrompt("");
                      setAnswer("");
                      setExplanation("");
                      setOptions("");
                      setPairs("");
                      resetGridEditor();
                    }}
                    disabled={savingEdit}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={createQuestion}
                  disabled={creating}
                  className="btn btn-primary"
                >
                  {creating ? "Creating..." : "Create Question"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2>All Questions ({filteredQuestions.length})</h2>

          <div className="filter-tabs" style={{ marginBottom: "20px" }}>
            <button
              className={`tab ${filterChapter === null ? "active" : ""}`}
              onClick={() => selectChapterTab(null)}
            >
              All Chapters
            </button>
            {questionChapters.map(ch => (
              <button
                key={ch}
                className={`tab ${filterChapter === ch ? "active" : ""}`}
                onClick={() => selectChapterTab(ch)}
              >
                Ch {ch}
              </button>
            ))}
          </div>

          {filterChapter === null && questionChapters.length > 0 && (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
              Select a chapter tab to drag and reorder its questions.
            </p>
          )}

          {filterChapter !== null && (
            <div className="card" style={{ padding: "16px 20px", marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
                Set schedule for all Chapter {filterChapter} questions
              </div>
              <div className="form-row" style={{ alignItems: "flex-end" }}>
                <div className="form-group">
                  <label>Available From</label>
                  <input type="datetime-local" value={bulkAvailableAt} onChange={e => setBulkAvailableAt(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="datetime-local" value={bulkDueAt} onChange={e => setBulkDueAt(e.target.value)} />
                </div>
                <button
                  onClick={applyBulkSchedule}
                  disabled={applyingBulkSchedule || (!bulkAvailableAt && !bulkDueAt)}
                  className="btn btn-primary"
                  style={{ height: "44px" }}
                >
                  {applyingBulkSchedule ? "Applying..." : `Apply to Chapter ${filterChapter}`}
                </button>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 0 0" }}>
                Only the fields you fill in are applied — leave one blank to leave existing values untouched.
              </p>
            </div>
          )}

          <div style={{ display: "grid", gap: "16px" }}>
            {filteredQuestions.map(q => (
              <div
                key={q.id}
                onMouseEnter={() => handleDragEnter(q.id)}
                className="question-card"
                style={{
                  borderLeftColor: "var(--navy)",
                  opacity: draggedId === q.id ? 0.5 : 1,
                  userSelect: draggedId ? "none" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {filterChapter !== null && (
                    <span
                      onMouseDown={e => {
                        e.preventDefault();
                        setDraggedId(q.id);
                      }}
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "18px",
                        lineHeight: 1,
                        cursor: "grab",
                        padding: "8px",
                        margin: "-8px",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                  )}
                  <div className="question-title">{q.title}</div>
                </div>

                <p
                  style={{
                    margin: "8px 0",
                    color: "var(--text)",
                    fontSize: "14px",
                  }}
                >
                  {q.prompt}
                </p>

                <div
                  className="question-meta"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className="badge badge-chapter">
                      Ch {q.chapter}
                    </span>
                    {q.available_at && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Opens {new Date(q.available_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                    {q.due_at && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Due {new Date(q.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    {/* EDIT */}
                    <button
                      className="btn btn-secondary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                      }}
                      onClick={() => editQuestion(q)}
                    >
                      Edit
                    </button>

                    {/* DELETE */}
                    <button
                      className="btn"
                      style={{
                        background: "#dc2626",
                        color: "white",
                        padding: "6px 12px",
                        fontSize: "12px",
                      }}
                      onClick={() => setDeleteTarget(q)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredQuestions.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>
                {questions.length === 0 ? "No questions yet. Create one above." : "No questions in this chapter."}
              </p>
            )}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" style={{ maxWidth: "420px" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: "8px" }}>Delete question?</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
              &ldquo;{deleteTarget.title}&rdquo; will be permanently deleted. This cannot be undone.
            </p>
            {(submissionCounts.get(deleteTarget.id) || 0) > 0 && (
              <div style={{
                padding: "12px 16px",
                borderRadius: "8px",
                backgroundColor: "var(--red-light)",
                borderLeft: "4px solid var(--red)",
                marginBottom: "16px",
              }}>
                <p style={{ margin: 0, color: "var(--red)", fontWeight: 600, fontSize: "14px" }}>
                  ⚠ {submissionCounts.get(deleteTarget.id)} student{submissionCounts.get(deleteTarget.id) === 1 ? "" : "s"} already submitted an answer to this question.
                </p>
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="btn"
                style={{ background: "#dc2626", color: "white", flex: 1 }}
                onClick={confirmDelete}
                disabled={deletingId === deleteTarget.id}
              >
                {deletingId === deleteTarget.id ? "Deleting..." : "Delete"}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 300,
            padding: "12px 20px",
            borderRadius: "8px",
            backgroundColor: toast.type === "success" ? "var(--green)" : "var(--red)",
            color: "var(--surface)",
            boxShadow: "var(--shadow-lg)",
            fontSize: "14px",
            fontWeight: 600,
            animation: "slide-up 200ms ease",
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
