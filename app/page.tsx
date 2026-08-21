"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    console.log("[HOME] Checking authentication...");

    const checkAuth = async () => {
      try {
        const result = await supabase.auth.getSession();

        if (result.error) {
          console.error("[HOME] Auth error:", result.error);
          router.replace("/login");
          return;
        }

        const session = result.data.session;

        console.log(
          "[HOME] Session:",
          session ? "authenticated" : "not authenticated"
        );

        if (session) {
          const { data: userRow } = await supabase
            .from("users")
            .select("role")
            .eq("id", session.user.id)
            .single();

          router.replace(userRow?.role === "ta" ? "/instructor" : "/student");
        } else {
          router.replace("/login");
        }
      } catch (error) {
        console.error("[HOME] getSession failed:", error);
        router.replace("/login");
      }
    };

    checkAuth();
  }, [router]);

  return <div>Loading...</div>;
}