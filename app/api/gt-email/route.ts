import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gt_email } = await req.json();

  if (typeof gt_email !== "string" || !/^[^\s@]+@gatech\.edu$/i.test(gt_email)) {
    return NextResponse.json({ error: "Please enter a valid @gatech.edu email." }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({ gt_email: gt_email.toLowerCase() })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}