import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyTAOfError } from "@/lib/notify-ta";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  let userEmail: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    // Verify TA role
    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!userRow || userRow.role !== "ta") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all submissions with student & question info
    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("id, user_id, question_id, answer, is_correct, score, submitted_at, users(email, gt_email), questions(title, chapter, points)")
      .order("submitted_at");

    if (error) {
      await notifyTAOfError({ route: "GET /api/export/csv", userEmail, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build CSV
    let csv = "Student Email,GT Email,Chapter,Question,Answer,Correct,Score,Max Score,Submitted At\n";
    submissions?.forEach((sub: any) => {
      const email = sub.users?.email || "unknown";
      const gtEmail = sub.users?.gt_email || "";
      const chapter = sub.questions?.chapter || "";
      const title = sub.questions?.title || "";
      const maxScore = sub.questions?.points || 1;
      const score = sub.score !== null ? sub.score : "—";
      const isCorrect = sub.is_correct === true ? "Yes" : sub.is_correct === false ? "No" : "Pending";
      const date = new Date(sub.submitted_at).toLocaleString();
      const answer = (sub.answer || "").replace(/"/g, '""'); // Escape quotes

      csv += `"${email}","${gtEmail}",${chapter},"${title}","${answer}",${isCorrect},${score}/${maxScore},"${date}"\n`;
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=homework-export.csv",
      },
    });
  } catch (e: any) {
    await notifyTAOfError({ route: "GET /api/export/csv", userEmail, message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}