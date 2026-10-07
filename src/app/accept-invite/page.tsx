"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCentered } from "@/components/auth/auth-shell";
import { acceptInvite } from "@/lib/store";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // Same two shapes an auth link can arrive in as reset-password's — PKCE
      // ?code=... or a #access_token=...&refresh_token=... hash fragment.
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          setReady(true);
          return;
        }
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!setSessionError) {
          window.history.replaceState(null, "", window.location.pathname);
          setReady(true);
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
        return;
      }

      setLinkError(true);
      setReady(true);
    })();
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await acceptInvite(password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Couldn't activate your account.");
      return;
    }
    // Dashboard's own role guard routes an event_support account straight to
    // its one event — no need to duplicate that logic here.
    router.push("/dashboard");
  }

  if (!ready) return <div className="min-h-screen bg-canvas" aria-busy="true" />;

  return (
    <AuthCentered>

        {linkError ? (
          <div className="text-center">
            <h1 className="eb-auth-title">Link expired</h1>
            <p className="text-muted text-sm">This invite link is invalid or has expired. Ask whoever invited you to send a new one.</p>
          </div>
        ) : (
          <>
            <h1 className="eb-auth-title">Set your password</h1>
            <p className="eb-auth-sub">One more step — choose a password to activate your account.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="eb-label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="eb-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:text-fg-3"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="eb-alert" role="alert">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-colors disabled:opacity-60"
                style={{ background: loading ? "#93147D" : "#C21FAF" }}
              >
                {loading ? "Activating…" : "Activate account"}
              </button>
            </form>
          </>
        )}
    </AuthCentered>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" aria-busy="true" />}>
      <AcceptInviteForm />
    </Suspense>
  );
}
