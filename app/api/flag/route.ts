import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyTAOfError } from "@/lib/notify-ta";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  let userEmail: string | null = null;
  try {
    const { submission_id, flagged } = await req.json();
    if (!submission_id) {
      return NextResponse.json({ error: "Missing submission_id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    // Students can only flag their own, TAs can flag any
    const { data: submission } = await supabase.from("submissions").select("user_id").eq("id", submission_id).single();
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!userRow) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (userRow.role === "student" && submission.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("submissions")
      .update({ flagged })
      .eq("id", submission_id)
      .select()
      .single();

    if (error) {
      await notifyTAOfError({ route: "PATCH /api/flag", userEmail, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    await notifyTAOfError({ route: "PATCH /api/flag", userEmail, message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
