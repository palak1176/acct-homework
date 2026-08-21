"use client";

import { createClient } from "@/lib/supabase-client";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error("[GOOGLE LOGIN] Error:", error);
        setError(error.message);
        setLoading(false);
      }
    } catch (err) {
      console.error("[GOOGLE LOGIN] Unexpected error:", err);
      setError("Unable to sign in with Google.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundImage:
          "repeating-linear-gradient(90deg, transparent, transparent 35px, rgba(26, 46, 74, 0.03) 35px, rgba(26, 46, 74, 0.03) 70px)",
        padding: "20px",
      }}
    >
      <div className="card" style={{ maxWidth: "480px", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              fontSize: "40px",
              fontFamily: "'Playfair Display', serif",
              fontWeight: "700",
              color: "var(--navy)",
              marginBottom: "4px",
            }}
          >
            <span style={{ color: "var(--navy)" }}>ACCT </span>
            <span style={{ color: "var(--gold)" }}>2101</span>
          </div>

          <h1
            style={{
              fontSize: "32px",
              marginTop: "20px",
              marginBottom: "8px",
              color: "var(--navy)",
            }}
          >
            Accounting Homework
          </h1>

          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "14px",
              margin: "0",
            }}
          >
            Sign in to access your assignments
          </p>
        </div>

        {error && (
          <p
            style={{
              color: "red",
              fontSize: "13px",
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            backgroundColor: "white",
            color: "#1f2937",
            fontSize: "14px",
            fontWeight: "600",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {!loading && (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M21.35 12.23c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42z"
              />
              <path
                fill="#34A853"
                d="M12 21.5c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5z"
              />
              <path
                fill="#FBBC05"
                d="M6.54 13.59A5.86 5.86 0 0 1 6.23 12c0-.55.1-1.08.31-1.59V7.88H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.12l3.24-2.53z"
              />
              <path
                fill="#EA4335"
                d="M12 6.38c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.43 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.38l3.24 2.53c.77-2.31 2.92-4.03 5.46-4.03z"
              />
            </svg>
          )}

          {loading ? "Redirecting to Google..." : "Continue with Google"}
        </button>

      </div>
    </div>
  );
}
