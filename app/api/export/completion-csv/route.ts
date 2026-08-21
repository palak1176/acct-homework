import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!userRow || userRow.role !== "ta") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: students, error: studentsError } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("role", "student")
      .order("name");

    if (studentsError) {
      return NextResponse.json({ error: studentsError.message }, { status: 500 });
    }

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("id, chapter");

    if (questionsError) {
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }

    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("user_id, question_id");

    if (submissionsError) {
      return NextResponse.json({ error: submissionsError.message }, { status: 500 });
    }

    const chapters = Array.from(new Set((questions ?? []).map(q => q.chapter))).sort((a, b) => a - b);

    const questionsByChapter = new Map<number, Set<string>>();
    chapters.forEach(ch => questionsByChapter.set(ch, new Set()));
    (questions ?? []).forEach(q => questionsByChapter.get(q.chapter)?.add(q.id));

    const submittedByStudent = new Map<string, Set<string>>();
    (submissions ?? []).forEach(s => {
      if (!submittedByStudent.has(s.user_id)) submittedByStudent.set(s.user_id, new Set());
      submittedByStudent.get(s.user_id)!.add(s.question_id);
    });

    const totalQuestions = (questions ?? []).length;

    const header = ["Student Name", "Email", ...chapters.map(ch => `Chapter ${ch} %`), "Overall %"];
    let csv = header.join(",") + "\n";

    (students ?? []).forEach(st => {
      const submittedIds = submittedByStudent.get(st.id) ?? new Set<string>();

      const chapterPcts = chapters.map(ch => {
        const chapterQuestionIds = questionsByChapter.get(ch) ?? new Set<string>();
        if (chapterQuestionIds.size === 0) return "";
        const completed = [...chapterQuestionIds].filter(id => submittedIds.has(id)).length;
        return Math.round((completed / chapterQuestionIds.size) * 100);
      });

      const overallPct = totalQuestions > 0 ? Math.round((submittedIds.size / totalQuestions) * 100) : 0;

      const name = (st.name || "").replace(/"/g, '""');
      const email = (st.email || "").replace(/"/g, '""');

      csv += [`"${name}"`, `"${email}"`, ...chapterPcts, overallPct].join(",") + "\n";
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=completion-by-chapter.csv",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
