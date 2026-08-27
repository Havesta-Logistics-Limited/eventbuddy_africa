"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { challengeAndVerify } from "@/lib/mfa";
import { Logo } from "@/components/logo";

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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#22103A" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <Logo tone="white" height={18} />
          <p className="text-xs text-white/40 flex items-center gap-1.5">
            <ShieldCheck size={12} />
            Platform Admin
          </p>
        </div>

        {mfaFactorId ? (
          <form onSubmit={handleVerifyMfa} className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Verification code</label>
              <p className="text-xs text-white/40 mb-2">Enter the current code from your authenticator app.</p>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full px-4 py-2.5 rounded-lg border border-white/10 text-sm text-white tracking-widest placeholder:text-white/30 bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#FF8AF5] focus:border-transparent"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-[#C21FAF] hover:bg-[#93147D] transition-colors disabled:opacity-60"
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
              className="w-full text-center text-xs text-white/40 hover:text-white/70"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@eventbuddy.africa"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-white/10 text-sm text-white placeholder:text-white/30 bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#FF8AF5] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-white/10 text-sm text-white placeholder:text-white/30 bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#FF8AF5] focus:border-transparent pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-[#C21FAF] hover:bg-[#93147D] transition-colors disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="text-center text-sm mt-6">
              <button type="button" onClick={() => router.push("/forgot-password")} className="text-white/50 hover:text-white/80 transition-colors">
                Forgot password?
              </button>
            </p>

            <p className="text-center text-xs text-white/25 mt-4">This is a separate credential from any organization account.</p>
          </>
        )}
      </div>
    </div>
  );
}
