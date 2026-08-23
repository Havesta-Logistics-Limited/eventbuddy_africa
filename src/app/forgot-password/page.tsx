"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <Logo height={16} />
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} className="text-teal-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Check your email</h2>
            <p className="text-slate-500 text-sm mb-6">
              If an account exists for {email}, we&apos;ve sent a link to reset your password.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-1">Reset your password</h2>
            <p className="text-slate-500 text-sm mb-8">Enter your email and we&apos;ll send you a reset link.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-white"
                />
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
                className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
              <button type="button" onClick={() => router.push("/login")} className="text-brand-600 font-medium hover:underline">
                Back to sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
