import { createBrowserClient } from "@supabase/ssr";

let supabaseClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    }

    if (!key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    console.log("[SUPABASE] Creating browser client");

    supabaseClient = createBrowserClient(url, key, {
      auth: {
        flowType: "pkce",
      },
    });
  }

  return supabaseClient;
}