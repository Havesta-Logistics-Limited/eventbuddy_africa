"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Deliberately separate from /login and store.ts's login(). Platform admin is its
 * own credential and authorization axis, unrelated to any organization account —
 * this page never touches `organizations` or the org-oriented sessionCache, it
 * only checks Supabase Auth + membership in `platform_admins`.
 */
export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    router.push("/platform");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-1">
            <Globe2 size={22} className="text-fuchsia-300" />
          </div>
          <p className="font-display text-xl text-white">UniLink</p>
          <p className="text-xs text-white/40 flex items-center gap-1.5">
            <ShieldCheck size={12} />
            Platform Admin
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@unilink.com"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-white/10 text-sm text-white placeholder:text-white/30 bg-white/5 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:border-transparent"
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
                className="w-full px-4 py-2.5 rounded-lg border border-white/10 text-sm text-white placeholder:text-white/30 bg-white/5 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:border-transparent pr-10"
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
            className="w-full py-2.5 rounded-lg font-medium text-sm text-slate-950 bg-fuchsia-300 hover:bg-fuchsia-200 transition-colors disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-white/25 mt-6">
          This is a separate credential from any organization account.
        </p>
      </div>
    </div>
  );
}
