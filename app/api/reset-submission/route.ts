import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyTAOfError } from "@/lib/notify-ta";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  let userEmail: string | null = null;
  try {
    const { question_id } = await req.json();
    if (!question_id) {
      return NextResponse.json({ error: "Missing question_id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    // TAs only, and only their own submissions - this is a testing convenience,
    // not a general "let anyone redo homework" escape hatch.
    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!userRow || userRow.role !== "ta") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("submissions")
      .delete()
      .eq("user_id", user.id)
      .eq("question_id", question_id);

    if (error) {
      await notifyTAOfError({ route: "DELETE /api/reset-submission", userEmail, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    await notifyTAOfError({ route: "DELETE /api/reset-submission", userEmail, message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
