"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthCentered } from "@/components/auth/auth-shell";
import { isValidEmail } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Show the same success state either way — confirming whether an email exists
      // would let someone probe for registered accounts.
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCentered>

        {sent ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-teal-300" />
            </div>
            <h1 className="eb-auth-title">Check your email</h1>
            <p className="text-muted text-sm mb-6">
              If an account exists for {email}, we&apos;ve sent a link to reset your password.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="eb-link text-sm"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h1 className="eb-auth-title">Reset your password</h1>
            <p className="eb-auth-sub">Enter your email and we&apos;ll send you a reset link.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="eb-label">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="eb-input"
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
                disabled={loading}
                className="eb-btn eb-btn--primary w-full"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-sm text-muted mt-6">
              <button type="button" onClick={() => router.push("/login")} className="eb-link text-xs">
                Back to sign in
              </button>
            </p>
          </>
        )}
    </AuthCentered>
  );
}
