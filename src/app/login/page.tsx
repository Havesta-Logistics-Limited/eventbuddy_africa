"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinCheckInside, Eye, EyeOff, AlertCircle } from "lucide-react";
import { login, useSession } from "@/lib/store";

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      router.replace(session.role === "admin" ? "/dashboard" : session.role === "rep" ? "/leads" : "/collect");
    }
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Invalid email or password. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #1a0533 0%, #8a0e8f 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <MapPinCheckInside size={28} className="text-fuchsia-300" />
            <div>
              <p className="font-display text-xl">EventPal</p>
              <p className="text-xs text-white/50 -mt-0.5">Desired Results On The Go</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h1 className="font-display text-4xl leading-tight">
            Run any event.
            <br />
            <em>Capture every</em>
            <br />
            qualified lead.
          </h1>
          <p className="text-white/60 text-base max-w-sm">Manage your events, collect qualified leads, and share insights — all in one platform.</p>
          <div className="grid grid-cols-3 gap-4 pt-2">
            {["🎓 Education Fairs", "💼 Job Fairs", "🎤 Conferences", "🏬 Trade Shows", "🚀 Launches", "✨ Custom Events"].map((d) => (
              <div key={d} className="bg-white/10 rounded-lg px-3 py-2 text-sm text-center">
                {d}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-white/30 text-xs">© 2026 EventPal. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <MapPinCheckInside size={24} className="text-[#610064]" />
            <span className="font-display text-xl" style={{ color: "#610064" }}>
              EventPal
            </span>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@eventpal.com"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] focus:border-transparent bg-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-xs font-medium text-[#610064] hover:underline"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] focus:border-transparent bg-white pr-10"
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 p-4 rounded-xl bg-slate-100 text-xs text-slate-500 space-y-1.5">
            <p>
              New here?{" "}
              <button type="button" onClick={() => router.push("/signup")} className="text-[#610064] font-medium hover:underline">
                Create your organization account
              </button>
            </p>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p>
                Staff or university rep? Use the check-in link your event coordinator shared with you — it&apos;s specific to
                your organization, so it isn&apos;t listed here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
