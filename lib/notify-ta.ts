import { createAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/resend";

// Fire-and-forget: emails every TA when a request fails server-side.
// Uses the admin client so this works even when the failing request came
// from a student session, which can't read other users' rows under RLS.
export async function notifyTAOfError(context: {
  route: string;
  userEmail?: string | null;
  message: string;
}) {
  try {
    const admin = createAdminClient();
    const { data: tas } = await admin.from("users").select("email").eq("role", "ta");
    const emails = (tas ?? []).map((t: any) => t.email).filter(Boolean);
    if (emails.length === 0) return;

    await sendEmail({
      to: emails,
      subject: `[Homework Tracker] Error in ${context.route}`,
      html: `
        <p><strong>Route:</strong> ${context.route}</p>
        <p><strong>User:</strong> ${context.userEmail || "unknown"}</p>
        <p><strong>Error:</strong> ${context.message}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
    });
  } catch (e) {
    console.error("[NOTIFY TA] Failed to send error notification:", e);
  }
}
