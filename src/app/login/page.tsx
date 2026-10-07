"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { completeMfaLogin, login, useSession } from "@/lib/store";
import { AuthSplit } from "@/components/auth/auth-shell";
import { isValidEmail } from "@/lib/validation";

// useSearchParams needs a Suspense boundary so the page can still prerender.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

/** One sign-in for everyone: organizers, invited admins and promoters (the
 *  account type is detected after sign-in). ?as=promoter, used by the promoter
 *  pages' Sign in links, only swaps the copy for promoter-facing wording. */
function LoginForm() {
  const asPromoter = useSearchParams().get("as") === "promoter";
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    if (session) {
      router.replace(session.role === "admin" ? "/dashboard" : session.role === "promoter" ? "/promoter" : session.role === "rep" ? "/leads" : "/collect");
    }
  }, [session, router]);

  // An unverified account can ask for a fresh verification link right here.
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  async function resendVerification() {
    setResendState("sending");
    const res = await fetch("/api/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    if (res?.ok) setResendState("sent");
    else {
      setResendState("idle");
      setError("We couldn't send the email just now. Try again in a minute.");
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.mfaRequired && result.factorId) {
      setMfaFactorId(result.factorId);
      return;
    }
    if (!result.success) {
      setError(result.error || "Invalid email or password. Please try again.");
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError("");
    setLoading(true);
    const result = await completeMfaLogin(mfaFactorId, mfaCode);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Invalid code. Please try again.");
    }
  };

  return (
    <AuthSplit
      headline={asPromoter ? "Share events you love." : "Sell your tickets."}
      accent={asPromoter ? "Get paid for it." : "Then we run the whole event."}
      sub={
        asPromoter
          ? "Sign in to see your events, links, earnings and payouts."
          : "Registration, ticketing, check-in and a live event hub for any event. Sign in to pick up where you left off."
      }
    >

          {mfaFactorId ? (
            <>
              <h1 className="eb-auth-title">Enter your 2FA code</h1>
              <p className="eb-auth-sub">Open your authenticator app and enter the current 6-digit code.</p>

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
            </>
          ) : (
            <>
              <h1 className="eb-auth-title">{asPromoter ? "Promoter sign in" : "Welcome back"}</h1>
              <p className="eb-auth-sub">
                {asPromoter ? "Sign in with the email you used to join as a promoter." : "Organizers and promoters both sign in here."}
              </p>

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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="eb-label mb-0">Password</label>
                    <button
                      type="button"
                      onClick={() => router.push("/forgot-password")}
                      className="eb-link text-xs"
                    >
                      Forgot password?
                    </button>
                  </div>
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
                    <span>
                      {error}
                      {/verify your email/i.test(error) && (
                        <button type="button" onClick={resendVerification} disabled={resendState === "sending"} className="eb-link ml-1 font-semibold">
                          {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Sent, check your inbox" : "Resend the email"}
                        </button>
                      )}
                    </span>
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

              <div className="eb-auth-foot">
                <p>
                  New here?{" "}
                  {asPromoter ? (
                    <>
                      <button type="button" onClick={() => router.push("/promote")} className="eb-link text-xs">
                        Become a promoter
                      </button>
                      {" · "}
                      <button type="button" onClick={() => router.push("/signup")} className="eb-link text-xs">
                        Organize an event
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => router.push("/signup")} className="eb-link text-xs">
                        Create your organization account
                      </button>
                      {" · "}
                      <button type="button" onClick={() => router.push("/promote")} className="eb-link text-xs">
                        Become a promoter
                      </button>
                    </>
                  )}
                </p>
              </div>
            </>
          )}
    </AuthSplit>
  );
}