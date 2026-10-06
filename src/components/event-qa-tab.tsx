"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, EyeOff, MessageSquareText, RefreshCw } from "lucide-react";
import { EventQuestion, EventSession, EventSpeaker } from "@/lib/types";
import { PersistError, listEventQuestions, moderateQuestion } from "@/lib/store";

const STATUS_PILL: Record<EventQuestion["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-brand-500/15 text-brand-500",
  answered: "bg-emerald-500/15 text-emerald-300",
  hidden: "bg-fill text-muted",
};

/** Q&A moderation queue — polls every few seconds so new attendee-submitted
 *  questions show up without a manual refresh, matching the "near-live" bar a
 *  conference Q&A actually needs (see the Event Hub build plan: polling over
 *  websockets for v1, upgradeable later without changing this component's shape). */
export function QaTab({ eventId, sessions, speakers }: { eventId: string; sessions: EventSession[]; speakers: EventSpeaker[] }) {
  const [questions, setQuestions] = useState<EventQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "answered" | "hidden" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const rows = await listEventQuestions(eventId);
      setQuestions(rows);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load questions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleModerate(id: string, status: EventQuestion["status"]) {
    setBusyId(id);
    try {
      await moderateQuestion(id, status);
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this question.");
    } finally {
      setBusyId(null);
    }
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const filtered = filter === "all" ? questions : questions.filter((q) => q.status === filter);
  const pendingCount = questions.filter((q) => q.status === "pending").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "answered", "hidden", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-brand-600 text-white" : "bg-surface border border-line text-fg-3 hover:border-line-strong"
              }`}
            >
              {f}
              {f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
        <button onClick={refresh} className="p-2 rounded-lg border border-line text-muted hover:bg-canvas">
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-subtle text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-subtle bg-canvas rounded-xl border border-line">
          <MessageSquareText size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No {filter !== "all" ? filter : ""} questions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <div key={q.id} className="bg-surface rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-fg text-sm">{q.askedByName}</span>
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_PILL[q.status]}`}>{q.status}</span>
                  {q.sessionId && sessionById.get(q.sessionId) && (
                    <span className="text-[11px] text-muted bg-fill px-2 py-0.5 rounded-full">{sessionById.get(q.sessionId)!.title}</span>
                  )}
                  {q.speakerId && speakerById.get(q.speakerId) && (
                    <span className="text-[11px] text-muted bg-fill px-2 py-0.5 rounded-full">for {speakerById.get(q.speakerId)!.name}</span>
                  )}
                </div>
                <span className="text-[11px] text-subtle">{new Date(q.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="text-sm text-fg-2 mb-3">{q.questionText}</p>
              <div className="flex items-center gap-2">
                {q.status !== "approved" && (
                  <button
                    onClick={() => handleModerate(q.id, "approved")}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline disabled:opacity-50"
                  >
                    <Check size={12} /> Approve
                  </button>
                )}
                {q.status !== "answered" && (
                  <button
                    onClick={() => handleModerate(q.id, "answered")}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:underline disabled:opacity-50"
                  >
                    <Check size={12} /> Mark answered
                  </button>
                )}
                {q.status !== "hidden" && (
                  <button
                    onClick={() => handleModerate(q.id, "hidden")}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 text-xs font-medium text-muted hover:underline disabled:opacity-50 ml-auto"
                  >
                    <EyeOff size={12} /> Hide
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
