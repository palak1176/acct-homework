import { createClient } from "@supabase/supabase-js";

let adminClient: ReturnType<typeof createClient> | undefined;

// Service-role client for server-only code that must read/write across
// RLS boundaries (e.g. notifying TAs about a student's failed request,
// or the due-date reminder cron which has no user session). Never import
// this from a client component.
export function createAdminClient() {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

    adminClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return adminClient;
}
