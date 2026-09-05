"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
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

  if (!ready) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <Logo height={16} />
        </div>

        {linkError ? (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Link expired</h2>
            <p className="text-slate-500 text-sm">This invite link is invalid or has expired. Ask whoever invited you to send a new one.</p>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-1">Set your password</h2>
            <p className="text-slate-500 text-sm mb-8">One more step — choose a password to activate your account.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF] focus:border-transparent bg-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
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
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AcceptInviteForm />
    </Suspense>
  );
}
