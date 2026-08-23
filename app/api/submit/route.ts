import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyTAOfError } from "@/lib/notify-ta";
import { NextRequest, NextResponse } from "next/server";

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  let userEmail: string | null = null;
  try {
    const { question_id, answer, image_url } = await req.json();
    if (!question_id || !answer) {
      return NextResponse.json({ error: "Missing question_id or answer" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    // Fetch question + check due date
    const { data: question, error: qError } = await supabase
      .from("questions")
      .select("*")
      .eq("id", question_id)
      .single();

    if (qError || !question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (question.due_at && new Date() > new Date(question.due_at)) {
      return NextResponse.json({ error: "Question is past due" }, { status: 403 });
    }

    if (question.available_at && new Date() < new Date(question.available_at)) {
      return NextResponse.json({ error: "Question is not yet available" }, { status: 403 });
    }

    // Only one attempt is allowed per question
    const { data: existingSubmission } = await supabase
      .from("submissions")
      .select("id")
      .eq("user_id", user.id)
      .eq("question_id", question_id)
      .single();

    if (existingSubmission) {
      return NextResponse.json({ error: "You have already submitted an answer for this question" }, { status: 403 });
    }

    // Grade the answer
    let is_correct: boolean | null = false;
    let score: number | null = 0;

    if (question.type === "text" || question.type === "fill_blank") {
      is_correct = normalizeAnswer(answer) === normalizeAnswer(question.correct_answer);
      score = is_correct ? (question.points || 1) : 0;
    } else if (question.type === "multiple_choice") {
      // correct_answer is the option value/index
      is_correct = answer === question.correct_answer;
      score = is_correct ? (question.points || 1) : 0;
    } else if (question.type === "matching") {
      // answer is a JSON-encoded map of pair id -> chosen right-side value
      let studentMap: Record<string, string> = {};
      let correctMap: Record<string, string> = {};
      try { studentMap = JSON.parse(answer); } catch { studentMap = {}; }
      try { correctMap = JSON.parse(question.correct_answer); } catch { correctMap = {}; }

      const pairIds = Object.keys(correctMap);
      const matches = pairIds.filter(id => studentMap[id] === correctMap[id]).length;

      is_correct = pairIds.length > 0 && matches === pairIds.length;
      score = pairIds.length > 0
        ? Math.round((matches / pairIds.length) * (question.points || 1) * 100) / 100
        : 0;
    } else if (question.type === "image") {
      // TA must manually grade image submissions
      is_correct = null;
      score = null;
    }

    // Upsert submission
    const { data: submission, error: sError } = await supabase
      .from("submissions")
      .upsert(
        {
          user_id: user.id,
          question_id,
          answer,
          image_url: question.type === "image" ? image_url : null,
          is_correct,
          score,
          attempt_count: 1,
          submitted_at: new Date().toISOString(),
          graded_at: is_correct !== null ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,question_id" }
      )
      .select()
      .single();

    if (sError) {
      await notifyTAOfError({ route: "POST /api/submit", userEmail, message: sError.message });
      return NextResponse.json({ error: sError.message }, { status: 500 });
    }

    return NextResponse.json({
      is_correct,
      score,
      explanation: question.explanation,
      correct_answer: question.correct_answer,
      message: is_correct ? "Correct!" : is_correct === false ? "Incorrect" : "Submitted for manual grading",
    });
  } catch (e: any) {
    await notifyTAOfError({ route: "POST /api/submit", userEmail, message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
