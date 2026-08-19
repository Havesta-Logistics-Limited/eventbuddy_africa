"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, MapPinCheckInside } from "lucide-react";
import { login } from "@/lib/store";
import { AttendeeBadgeArt } from "@/components/attendee-badge-art";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create your account.");
        setLoading(false);
        return;
      }

      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || "Account created — please sign in.");
        setLoading(false);
        router.push("/login");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full px-4 py-2.5 rounded-lg border border-[#E8E1E6] text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] focus:border-transparent bg-white transition-shadow";
  const labelClass = "block text-sm font-medium text-[#221726] mb-1.5";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#FBF9F7" }}>
      {/* Brand panel — the product's own artifact (QR + reference ID) as the hero, not a generic illustration */}
      <div
        className="relative lg:w-[44%] xl:w-[42%] overflow-hidden px-8 pt-9 pb-14 lg:py-14 lg:px-12 flex flex-col shrink-0"
        style={{ background: "linear-gradient(160deg, #2B0130 0%, #4A0250 48%, #610064 100%)" }}
      >
        <div className="flex items-center gap-2">
          <MapPinCheckInside size={20} className="text-white" />
          <span className="font-display text-lg text-white">EventPal</span>
        </div>

        <div className="mt-10 lg:mt-14 max-w-sm">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-white/45 mb-3">For event organizers</p>
          <h1 className="font-display text-[1.75rem] lg:text-[2.05rem] leading-[1.18] text-white">
            Every attendee gets a badge that does the work for you.
          </h1>
          <p className="text-white/55 text-[13.5px] mt-4 leading-relaxed">
            QR check-in, reference IDs, and lead capture — built into one link you share, for every event you run.
          </p>
        </div>

        <div className="mt-10 lg:mt-auto lg:pt-10 flex justify-center lg:justify-start">
          <AttendeeBadgeArt />
        </div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:py-14">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl mb-1" style={{ color: "#221726" }}>
            Create your account
          </h2>
          <p className="text-slate-500 text-sm mb-8">Set up your organization to start hosting events.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-colors disabled:opacity-60"
              style={{ background: loading ? "#8a0e8f" : "#610064" }}
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <button type="button" onClick={() => router.push("/login")} className="text-[#610064] font-medium hover:underline">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
