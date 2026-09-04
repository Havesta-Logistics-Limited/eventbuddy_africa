"use client";

import { useState } from "react";
import { HeartHandshake } from "lucide-react";

/** The post-registration "Book a 1-on-1" step — deliberately just an interest flag,
 *  not a speaker or time-slot picker. The organizer reviews these requests
 *  themselves and works out who the attendee actually meets with (a booth, a room,
 *  a specific speaker) — see event-one-on-one-tab.tsx. */
export function OneOnOneRequestStep({
  orgSlug,
  eventId,
  defaultFullName,
  defaultEmail,
  defaultPhone,
  onSkip,
  onRequested,
}: {
  orgSlug: string;
  eventId: string;
  defaultFullName: string;
  defaultEmail: string;
  defaultPhone?: string;
  onSkip: () => void;
  onRequested: () => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleRequest() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${eventId}/one-on-one/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: defaultFullName, email: defaultEmail, phone: defaultPhone, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't send your request. Please try again.");
        return;
      }
      onRequested();
    } catch {
      setError("Couldn't send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <div className="text-center mb-5">
        <div className="w-12 h-12 rounded-full bg-[#FFF3FD] text-[#C21FAF] flex items-center justify-center mx-auto mb-3">
          <HeartHandshake size={20} />
        </div>
        <h2 className="font-semibold text-lg text-slate-900">Want a 1-on-1?</h2>
        <p className="text-sm text-slate-500 mt-1">Let us know and the organizer will set up a meeting for you at the event.</p>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-500 mb-1.5">What would you like to discuss? (optional)</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Interested in your AI product roadmap"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
        />
      </div>

      {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={onSkip} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          No thanks
        </button>
        <button
          type="button"
          onClick={handleRequest}
          disabled={submitting}
          className="ml-auto px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ background: "#C21FAF" }}
        >
          {submitting ? "Sending…" : "Yes, I'm interested"}
        </button>
      </div>
    </div>
  );
}
