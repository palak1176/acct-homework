import { createAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/resend";
import { NextRequest, NextResponse } from "next/server";

// Triggered by Vercel Cron (see vercel.json). Emails each student a list of
// their unanswered questions that are due within the next 24 hours.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: questionsData, error: qError } = await admin
    .from("questions")
    .select("id, chapter, title, due_at")
    .not("due_at", "is", null)
    .gte("due_at", now.toISOString())
    .lte("due_at", windowEnd.toISOString());

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }
  const questions = (questionsData ?? []) as { id: string; chapter: number; title: string; due_at: string }[];
  if (questions.length === 0) {
    return NextResponse.json({ sent: 0, message: "No questions due soon" });
  }

  const questionIds = questions.map((q: any) => q.id);

  const { data: studentsData, error: sError } = await admin
    .from("users")
    .select("id, email, name")
    .eq("role", "student");

  if (sError) {
    return NextResponse.json({ error: sError.message }, { status: 500 });
  }
  const students = (studentsData ?? []) as { id: string; email: string; name: string | null }[];
  if (students.length === 0) {
    return NextResponse.json({ sent: 0, message: "No students" });
  }

  const { data: submissionsData, error: subError } = await admin
    .from("submissions")
    .select("user_id, question_id")
    .in("question_id", questionIds);

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }
  const submissions = (submissionsData ?? []) as { user_id: string; question_id: string }[];

  const submittedByStudent = new Map<string, Set<string>>();
  submissions.forEach(s => {
    if (!submittedByStudent.has(s.user_id)) submittedByStudent.set(s.user_id, new Set());
    submittedByStudent.get(s.user_id)!.add(s.question_id);
  });

  let sent = 0;

  for (const student of students) {
    const submittedIds = submittedByStudent.get(student.id) ?? new Set<string>();
    const outstanding = questions.filter(q => !submittedIds.has(q.id));
    if (outstanding.length === 0) continue;

    const items = outstanding
      .map(q => `<li>Chapter ${q.chapter}: <strong>${q.title}</strong> — due ${new Date(q.due_at).toLocaleString()}</li>`)
      .join("");

    await sendEmail({
      to: student.email,
      subject: `Homework due soon: ${outstanding.length} question${outstanding.length === 1 ? "" : "s"}`,
      html: `
        <p>Hi ${student.name || "there"},</p>
        <p>You have ${outstanding.length} unanswered question${outstanding.length === 1 ? "" : "s"} due within 24 hours:</p>
        <ul>${items}</ul>
        <p><a href="${process.env.APP_URL || ""}/student">Go to your homework</a></p>
      `,
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
