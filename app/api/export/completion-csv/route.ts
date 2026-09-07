import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyTAOfError } from "@/lib/notify-ta";
import { NextRequest, NextResponse } from "next/server";

async function fetchAllRows<T>(baseQuery: any): Promise<T[]> {
  const pageSize = 1000;
  let allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await baseQuery.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data as T[]);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export async function GET(req: NextRequest) {
  let userEmail: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!userRow || userRow.role !== "ta") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const students = await fetchAllRows<any>(
      supabase.from("users").select("id, name, email, gt_email").eq("role", "student").order("name")
    );

    const questions = await fetchAllRows<any>(
      supabase.from("questions").select("id, chapter")
    );

    const submissions = await fetchAllRows<any>(
      supabase.from("submissions").select("user_id, question_id")
    );

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

    const header = ["Student Name", "Email", "GT Email", ...chapters.map(ch => `Chapter ${ch} %`), "Overall %"];
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
      const gtEmail = (st.gt_email || "").replace(/"/g, '""');

      csv += [`"${name}"`, `"${email}"`, `"${gtEmail}"`, ...chapterPcts, overallPct].join(",") + "\n";
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=completion-by-chapter.csv",
      },
    });
  } catch (e: any) {
    await notifyTAOfError({ route: "GET /api/export/completion-csv", userEmail, message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}