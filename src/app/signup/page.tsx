"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, MailCheck } from "lucide-react";
import { AttendeeBadgeArt } from "@/components/attendee-badge-art";
import { Logo } from "@/components/logo";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, orgName, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create your account.");
        setLoading(false);
        return;
      }
      setSubmittedEmail(email);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-5">
            <MailCheck size={24} className="text-brand-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Check your email</h2>
          <p className="text-slate-500 text-sm mb-8">
            We&apos;ve sent a verification link to <span className="font-medium text-slate-700">{submittedEmail}</span>. Verify your email to
            activate your account — you won&apos;t be able to sign in until it&apos;s confirmed.
          </p>
          <button type="button" onClick={() => router.push("/login")} className="text-sm font-medium text-brand-600 hover:underline">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const fieldClass =
    "w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-white transition-shadow";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

  return (
    <div className="min-h-screen flex">
      {/* Left panel — same structure/rhythm as the login page's (hidden below lg,
          justify-between 3-section layout, p-12), with the product's own artifact
          (QR + reference ID) as the supporting visual instead of a generic one. */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden" style={{ background: "#22103A" }}>
        {/* Real photo behind the gradient — same source as the marketing hero. */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1531058020387-3be344556be6?w=1000&h=1400&fit=crop&q=75&auto=format)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 140% 160% at 15% -10%, rgba(194,31,175,0.9) 0%, rgba(147,20,125,0.93) 40%, rgba(23,8,33,0.97) 100%)" }}
        />
        {/* Extra scrim in the top-left corner, where the logo sits — the main
            gradient's brightest point is nearly the same spot, so without this the
            white wordmark loses contrast against the bright green/photo underneath. */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 32%)" }} />

        <div className="relative">
          <Logo tone="white" height={18} />
        </div>

        <div className="relative space-y-6">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-white/45">For event organizers</p>
          <h1 className="font-display text-4xl leading-tight">
            Every attendee gets
            <br />
            a badge that does
            <br />
            the work for you.
          </h1>
          <p className="text-white/60 text-base max-w-sm">
            QR check-in, reference IDs, and lead capture — built into one link you share, for every event you run.
          </p>
          <div className="pt-2">
            <AttendeeBadgeArt compact />
          </div>
        </div>

        <p className="relative text-white/30 text-xs">© 2026 eventbuddy. All rights reserved.</p>
      </div>

      {/* Right panel — matches login's p-6/bg-slate-50/max-w-sm form column exactly. */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center mb-8">
            <Logo height={16} />
          </div>

          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Create your account</h2>
          <p className="text-slate-500 text-sm mb-8">Set up your organization to start hosting events.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Amaka Obi"
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Organization name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Bright Futures Events"
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Phone number</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 801 234 5678" required className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className={`${fieldClass} pr-10`}
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
              className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-[#C21FAF] hover:bg-[#93147D] transition-colors disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>

            <p className="text-xs text-slate-400 text-center leading-relaxed">
              By creating an account, you agree to eventbuddy&apos;s{" "}
              <Link href="/terms" className="text-slate-500 hover:text-slate-700 underline underline-offset-2">
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-slate-500 hover:text-slate-700 underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          </form>

          <div className="mt-8 p-4 rounded-xl bg-slate-100 text-xs text-slate-500 text-center">
            <p>
              Already have an account?{" "}
              <button type="button" onClick={() => router.push("/login")} className="text-brand-600 font-medium hover:underline">
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
