import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    console.error("[AUTH CALLBACK] Missing code");
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url)
    );
  }

  const supabase = await createServerSupabaseClient();

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error(
      "[AUTH CALLBACK] Code exchange failed:",
      exchangeError
    );

    return NextResponse.redirect(
      new URL("/login?error=auth_failed", request.url)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[AUTH CALLBACK] Could not get user:", userError);

    return NextResponse.redirect(
      new URL("/login?error=user_not_found", request.url)
    );
  }

  console.log("[AUTH CALLBACK] Logged in user:", user.email);

  // Look up the user's role
  const { data: userRow, error: roleError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  console.log("[AUTH CALLBACK] User row:", userRow);
  console.log("[AUTH CALLBACK] Role error:", roleError);

  if (roleError || !userRow) {
    console.error("[AUTH CALLBACK] No users row found");

    return NextResponse.redirect(
      new URL("/login?error=user_not_setup", request.url)
    );
  }

  // Send each role to its own home page
  if (userRow.role === "ta") {
    return NextResponse.redirect(
      new URL("/instructor", request.url)
    );
  }

  if (userRow.role === "student") {
    return NextResponse.redirect(
      new URL("/student", request.url)
    );
  }

  console.error("[AUTH CALLBACK] Unknown role:", userRow.role);

  return NextResponse.redirect(
    new URL("/login?error=invalid_role", request.url)
  );
}