import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyTAOfError } from "@/lib/notify-ta";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  let userEmail: string | null = null;
  try {
    const { searchParams } = new URL(req.url);
    const question_id = searchParams.get("question_id");

    if (!question_id) {
      return NextResponse.json({ error: "Missing question_id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    // Only reveal the result if this user has actually submitted this question
    const { data: submission } = await supabase
      .from("submissions")
      .select("is_correct, score, answer")
      .eq("user_id", user.id)
      .eq("question_id", question_id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: "No submission found for this question" }, { status: 404 });
    }

    const { data: question } = await supabase
      .from("questions")
      .select("correct_answer, explanation")
      .eq("id", question_id)
      .single();

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json({
      is_correct: submission.is_correct,
      score: submission.score,
      correct_answer: question.correct_answer,
      student_answer: submission.answer,
      explanation: question.explanation,
    });
  } catch (e: any) {
    await notifyTAOfError({ route: "GET /api/submission-result", userEmail, message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
