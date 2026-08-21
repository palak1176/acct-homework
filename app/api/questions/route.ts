import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const {
      chapter,
      title,
      prompt,
      correct_answer,
      explanation,
      type,
      options,
      due_at,
      available_at,
      points,
    } = await req.json();

    const supabase = await createServerSupabaseClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("[QUESTIONS AUTH] No authenticated user");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[QUESTIONS AUTH] user id:", user.id);
    console.log("[QUESTIONS AUTH] user email:", user.email);

    // Check users table
    const { data: userRow, error: userRowError } = await supabase
      .from("users")
      .select("id, email, name, role")
      .eq("id", user.id)
      .single();

    console.log("[QUESTIONS AUTH] users row:", userRow);
    console.log("[QUESTIONS AUTH] users query error:", userRowError);

    // Verify TA role
    if (!userRow || userRow.role !== "ta") {
      console.log(
        "[QUESTIONS AUTH] Forbidden - user row or TA role missing"
      );

      return NextResponse.json(
        {
          error: "Forbidden",
          debug: {
            userId: user.id,
            userEmail: user.email,
            userRow,
            userRowError: userRowError?.message ?? null,
          },
        },
        { status: 403 }
      );
    }

    // Insert question
    const { data, error } = await supabase
      .from("questions")
      .insert([
        {
          chapter,
          title,
          prompt,
          correct_answer,
          explanation,
          type: type || "text",
          options,
          due_at,
          available_at,
          points: points || 1,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("[QUESTIONS] Insert failed:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log("[QUESTIONS] Question created:", data.id);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (e: any) {
    console.error("[QUESTIONS] Unexpected error:", e);

    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const {
      id,
      chapter,
      title,
      prompt,
      correct_answer,
      explanation,
      type,
      options,
      due_at,
      available_at,
      points,
      order_index,
    } = await req.json();

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[QUESTIONS PATCH] user id:", user.id);
    console.log("[QUESTIONS PATCH] user email:", user.email);

    const { data: userRow, error: userRowError } = await supabase
      .from("users")
      .select("id, email, name, role")
      .eq("id", user.id)
      .single();

    console.log("[QUESTIONS PATCH] users row:", userRow);
    console.log("[QUESTIONS PATCH] users query error:", userRowError);

    if (!userRow || userRow.role !== "ta") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("questions")
      .update({
        chapter,
        title,
        prompt,
        correct_answer,
        explanation,
        type,
        options,
        due_at,
        available_at,
        points,
        order_index,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[QUESTIONS PATCH] Update failed:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (e: any) {
    console.error("[QUESTIONS PATCH] Unexpected error:", e);

    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    console.log("[QUESTIONS DELETE] Requested ID:", id);

    if (!id) {
      return NextResponse.json(
        { error: "Missing question id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[QUESTIONS DELETE] User:", user?.email);
    console.log("[QUESTIONS DELETE] Auth error:", authError);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify TA role
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    console.log("[QUESTIONS DELETE] User row:", userRow);
    console.log("[QUESTIONS DELETE] User query error:", userError);

    if (userError || !userRow || userRow.role !== "ta") {
      return NextResponse.json(
        { error: "Forbidden - TA access required" },
        { status: 403 }
      );
    }

    // Delete the question and return the deleted row
    const { data: deletedQuestion, error: deleteError } = await supabase
      .from("questions")
      .delete()
      .eq("id", id)
      .select()
      .single();

    console.log(
      "[QUESTIONS DELETE] Deleted question:",
      deletedQuestion
    );

    console.log(
      "[QUESTIONS DELETE] Delete error:",
      deleteError
    );

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    if (!deletedQuestion) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: deletedQuestion,
    });
  } catch (e) {
    console.error("[QUESTIONS DELETE] Unexpected error:", e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}