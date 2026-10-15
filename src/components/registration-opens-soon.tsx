"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, Clock } from "lucide-react";
import { isValidEmail } from "@/lib/validation";

/**
 * Shown in place of the ticket/registration form while an event's
 * registration hasn't opened yet (events.registration_open = false, migration
 * 0128): "opens soon", and an email box to be told when it opens.
 */
export function RegistrationOpensSoon({ orgSlug, eventId, eventName }: { orgSlug: string; eventId: string; eventName: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email.trim())) return setError("Enter a valid email address.");
    setError("");
    setState("sending");
    const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/notify-open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setState("idle");
      return setError(j.error || "Couldn't save that. Check your connection and try again.");
    }
    setState("done");
  }

  return (
    <div className="text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#FF8AF5]/15 text-[#FF8AF5]">
        <Clock size={22} aria-hidden="true" />
      </span>
      <p className="text-lg font-semibold text-white">Registration opens soon</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-white/60">{`Tickets and registration for ${eventName} aren't open yet.`}</p>
      {state === "done" ? (
        <p className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">
          <CheckCircle2 size={16} aria-hidden="true" /> We&apos;ll email you the moment it opens.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 text-left">
          <label htmlFor="notify-email" className="mb-1.5 block text-xs font-medium text-white/70">
            Get an email when it opens
          </label>
          <div className="flex gap-2">
            <input
              id="notify-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-white/20 bg-surface/5 px-3.5 py-2.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FF8AF5] sm:text-sm"
            />
            <button type="submit" disabled={state === "sending"} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" data-cta>
              <BellRing size={14} aria-hidden="true" /> {state === "sending" ? "Saving…" : "Notify me"}
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
        </form>
      )}
    </div>
  );
}
