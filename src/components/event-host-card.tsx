"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Flag, Mail, X } from "lucide-react";
import { FollowOrgButton } from "@/components/follow-org-button";

const AVATAR_COLORS = ["#FCE7F3", "#FEF3C7", "#DBEAFE", "#D1FAE5", "#EDE9FE", "#FFE4E6", "#FFEDD5", "#E0F2FE"];
const AVATAR_TEXT = ["#BE185D", "#B45309", "#1D4ED8", "#047857", "#6D28D9", "#BE123C", "#C2410C", "#0369A1"];

function initialsAvatar(name: string, i: number) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      key={i}
      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-white"
      style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], color: AVATAR_TEXT[i % AVATAR_TEXT.length] }}
      title={name}
    >
      {letter}
    </div>
  );
}

function namesLine(sampleNames: string[], totalCount: number) {
  if (sampleNames.length === 0) return null;
  const shown = sampleNames.slice(0, 3);
  const remaining = totalCount - shown.length;
  const joined = shown.join(", ");
  return remaining > 0 ? `${joined} and ${remaining} other${remaining !== 1 ? "s" : ""}` : joined;
}

function ContactModal({ title, placeholder, needsName, onClose, onSubmit }: { title: string; placeholder: string; needsName: boolean; onClose: () => void; onSubmit: (values: { name: string; email: string; message: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((needsName && !name.trim()) || !message.trim()) {
      setError("Please fill in the required fields.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), message: message.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {needsName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email (optional)"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
          />
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "#C21FAF" }}
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Real social proof for the register page, not decoration — a real attendee count
 *  and a bounded sample of real names (see /api/orgs/[slug]/events/[eventId]/attendee-summary),
 *  plus working "Contact the Host" and "Report Event" actions that relay a message by
 *  email rather than exposing the organizer's address or doing nothing at all. */
export function EventHostCard({
  orgSlug,
  eventId,
  orgName,
  attendeeSummary,
}: {
  orgSlug: string;
  eventId: string;
  orgName: string;
  attendeeSummary: { totalCount: number; sampleNames: string[] } | null;
}) {
  const [modal, setModal] = useState<"contact" | "report" | null>(null);

  async function submitContact(values: { name: string; email: string; message: string }) {
    const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${eventId}/contact-host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Couldn't send your message.");
    toast.success("Message sent to the host");
  }

  async function submitReport(values: { email: string; message: string }) {
    const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${eventId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: values.email, reason: values.message }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Couldn't send your report.");
    toast.success("Thanks — we'll take a look");
  }

  const totalCount = attendeeSummary?.totalCount ?? 0;
  const sampleNames = attendeeSummary?.sampleNames ?? [];

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6">
      <h2 className="font-semibold text-white mb-4">Hosted By</h2>
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/10">
        <div className="w-10 h-10 rounded-full bg-[#FF8AF5]/20 text-[#FF8AF5] flex items-center justify-center font-semibold shrink-0">
          {orgName.charAt(0).toUpperCase() || "?"}
        </div>
        <p className="font-medium text-white flex-1 min-w-0 truncate">{orgName}</p>
        <FollowOrgButton orgSlug={orgSlug} theme="dark" />
      </div>

      {totalCount > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-white/80 mb-3">
            {totalCount.toLocaleString()} Going
          </p>
          {sampleNames.length > 0 && (
            <>
              <div className="flex -space-x-2 mb-2">{sampleNames.slice(0, 8).map((n, i) => initialsAvatar(n, i))}</div>
              <p className="text-xs text-white/50">{namesLine(sampleNames, totalCount)}</p>
            </>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-white/10 space-y-2.5">
        <button type="button" onClick={() => setModal("contact")} className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white">
          <Mail size={14} />
          Contact the Host
        </button>
        <button type="button" onClick={() => setModal("report")} className="flex items-center gap-2 text-sm font-medium text-white/40 hover:text-rose-300">
          <Flag size={13} />
          Report Event
        </button>
      </div>

      {modal === "contact" && (
        <ContactModal
          title="Contact the host"
          placeholder="What would you like to ask?"
          needsName
          onClose={() => setModal(null)}
          onSubmit={submitContact}
        />
      )}
      {modal === "report" && (
        <ContactModal
          title="Report this event"
          placeholder="What's wrong with this event?"
          needsName={false}
          onClose={() => setModal(null)}
          onSubmit={(values) => submitReport({ email: values.email, message: values.message })}
        />
      )}
    </div>
  );
}
