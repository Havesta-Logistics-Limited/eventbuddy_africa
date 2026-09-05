"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, UserPlus } from "lucide-react";

/** Lets a visitor join an org's audience without registering for anything — the
 *  Contact/Report actions right below this on the register page are one-off;
 *  following is the ongoing relationship Luma's own host cards offer. Reused on
 *  both the register page's Hosted By card (dark glass) and the public org
 *  profile page (light), hence the theme prop rather than two components. */
export function FollowOrgButton({ orgSlug, theme = "light" }: { orgSlug: string; theme?: "light" | "dark" }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [following, setFollowing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't follow this organizer.");
        return;
      }
      setFollowing(true);
      toast.success("You're now following this organizer");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (following) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full shrink-0 ${
          theme === "dark" ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Check size={12} /> Following
      </span>
    );
  }

  return (
    <div className="shrink-0">
      {expanded ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className={`w-36 px-2.5 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 ${
              theme === "dark" ? "bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:ring-[#FF8AF5]" : "border-slate-200 focus:ring-brand-600"
            }`}
          />
          <button type="submit" disabled={submitting} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60 shrink-0" style={{ background: "#C21FAF" }}>
            {submitting ? "…" : "Go"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            theme === "dark" ? "border-white/20 text-white/80 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <UserPlus size={12} />
          Follow
        </button>
      )}
      {error && <p className={`text-xs mt-1 ${theme === "dark" ? "text-rose-300" : "text-rose-600"}`}>{error}</p>}
    </div>
  );
}
