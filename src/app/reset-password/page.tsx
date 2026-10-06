"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCentered } from "@/components/auth/auth-shell";
import { challengeAndVerify, getVerifiedFactor, needsStepUp } from "@/lib/mfa";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    const supabase = createClient();

    // The recovery link only ever grants an aal1 session. If this account has 2FA
    // enabled, Supabase rejects updateUser({ password }) with "AAL2 session is
    // required" until that session is stepped up — same challenge/verify flow as
    // logging in, just gating the password form instead of the dashboard.
    async function afterSessionEstablished() {
      if (await needsStepUp()) {
        const factor = await getVerifiedFactor();
        if (factor) {
          setMfaFactorId(factor.id);
          setReady(true);
          return;
        }
      }
      setReady(true);
    }

    (async () => {
      // Supabase's recovery link can arrive in two shapes: ?code=... (PKCE) or
      // #access_token=...&refresh_token=... (hash fragment). The client's own
      // automatic hash detection is unreliable here, so both are handled explicitly
      // rather than waiting on a PASSWORD_RECOVERY event that may not fire.
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          await afterSessionEstablished();
          return;
        }
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!setSessionError) {
          // Drop the tokens from the URL so they aren't left sitting in browser history.
          window.history.replaceState(null, "", window.location.pathname);
          await afterSessionEstablished();
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await afterSessionEstablished();
        return;
      }

      setLinkError(true);
      setReady(true);
    })();
  }, [searchParams]);

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError("");
    setLoading(true);
    try {
      await challengeAndVerify(mfaFactorId, mfaCode);
      setMfaFactorId(null);
      setMfaCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify that code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: updateError, data } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }
    // A platform admin resetting their password has no organization account — send
    // them back to the platform login, not the org-admin one, so "forgot password"
    // works the same from either sign-in screen.
    const { data: platformMembership } = await supabase.from("platform_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    setLoading(false);
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.push(platformMembership ? "/platform/login" : "/login"), 2000);
  }

  if (!ready) return <div className="min-h-screen bg-canvas" aria-busy="true" />;

  return (
    <AuthCentered>

        {linkError ? (
          <div className="text-center">
            <h1 className="eb-auth-title">Link expired</h1>
            <p className="text-muted text-sm mb-6">
              This password reset link is invalid or has expired. Request a new one.
            </p>
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="eb-link text-sm"
            >
              Request a new link
            </button>
          </div>
        ) : done ? (
          <div className="text-center">
            <h1 className="eb-auth-title">Password updated</h1>
            <p className="text-muted text-sm">Redirecting you to sign in…</p>
          </div>
        ) : mfaFactorId ? (
          <>
            <h1 className="eb-auth-title">Enter your 2FA code</h1>
            <p className="eb-auth-sub">
              This account has two-factor authentication on — open your authenticator app and enter the current 6-digit code to continue.
            </p>

            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <div>
                <label className="eb-label">Verification code</label>
                <input
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="eb-input tracking-widest"
                />
              </div>

              {error && (
                <div className="eb-alert" role="alert">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="eb-btn eb-btn--primary w-full"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="eb-auth-title">Set a new password</h1>
            <p className="eb-auth-sub">Choose a new password for your account.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="eb-label">New password</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-fg-3"
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
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
    </AuthCentered>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" aria-busy="true" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
