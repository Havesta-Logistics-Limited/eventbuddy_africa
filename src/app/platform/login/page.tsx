"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { challengeAndVerify } from "@/lib/mfa";
import { AuthCentered } from "@/components/auth/auth-shell";
import { isValidEmail } from "@/lib/validation";

/**
 * Deliberately separate from /login and store.ts's login(). Platform admin is its
 * own credential and authorization axis, unrelated to any organization account —
 * this page never touches `organizations` or the org-oriented sessionCache, it
 * only checks Supabase Auth + membership in `platform_admins`. 2FA step-up (when
 * enabled) is handled right here rather than via store.ts, for the same reason.
 */
export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError(signInError?.message || "Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!membership) {
      await supabase.auth.signOut();
      setError("This account doesn't have platform admin access.");
      setLoading(false);
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((f) => f.status === "verified");
      if (factor) {
        setMfaFactorId(factor.id);
        setLoading(false);
        return;
      }
    }

    router.push("/platform");
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError("");
    setLoading(true);
    try {
      await challengeAndVerify(mfaFactorId, mfaCode);
      router.push("/platform");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthCentered
      badge={
        <p className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">
          <ShieldCheck size={12} className="text-brand-500" />
          Platform Admin
        </p>
      }
    >

        {mfaFactorId ? (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div>
              <label className="eb-label">Verification code</label>
              <p className="eb-hint mb-2">Enter the current code from your authenticator app.</p>
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
              {loading ? "Verifying…" : "Verify & sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMfaFactorId(null);
                setMfaCode("");
                setError("");
              }}
              className="w-full text-center text-xs text-muted hover:text-fg-2"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <>
            <h1 className="eb-auth-title">Sign in</h1>
            <p className="eb-auth-sub">For eventbuddy&apos;s own team only.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="eb-label">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@eventbuddy.africa"
                  required
                  className="eb-input"
                />
              </div>
              <div>
                <label className="eb-label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
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
                className="eb-btn eb-btn--primary w-full"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="text-center text-sm mt-6">
              <button type="button" onClick={() => router.push("/forgot-password")} className="eb-link">
                Forgot password?
              </button>
            </p>

            <p className="text-center text-xs text-subtle mt-4">This is a separate credential from any organization account.</p>
          </>
        )}
    </AuthCentered>
  );
}
