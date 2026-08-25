"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Play, Plus, Square, Trash2, X } from "lucide-react";
import { EventPoll } from "@/lib/types";
import { PersistError, createPoll, deletePoll, listEventPolls, updatePollStatus } from "@/lib/store";

const STATUS_PILL: Record<EventPoll["status"], string> = {
  draft: "bg-slate-100 text-slate-500",
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-amber-100 text-amber-700",
};

/** Live-polls tab — mirrors the Q&A tab's polling refresh so vote counts (kept in
 *  sync by a database trigger, see 0036_event_hub_engagement.sql) update without a
 *  manual reload while a poll is open. */
export function PollsTab({ eventId }: { eventId: string }) {
  const [polls, setPolls] = useState<EventPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const rows = await listEventPolls(eventId);
      setPolls(rows);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load polls.");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) {
      setFormError("Enter a poll question.");
      return;
    }
    if (cleanOptions.length < 2) {
      setFormError("Add at least two options.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await createPoll({ eventId, question: question.trim(), options: cleanOptions });
      toast.success("Poll created — open it when you're ready to push it to the room");
      setQuestion("");
      setOptions(["", ""]);
      setShowForm(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't create this poll. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus(id: string, status: EventPoll["status"]) {
    setBusyId(id);
    try {
      await updatePollStatus(id, status);
      setPolls((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      if (status === "open") toast.success("Poll is live — attendees can vote now");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this poll.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deletePoll(id);
      setPolls((prev) => prev.filter((p) => p.id !== id));
      toast.success("Poll deleted");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't delete this poll.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">{polls.length} poll{polls.length !== 1 ? "s" : ""}</p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
          >
            <Plus size={14} />
            New Poll
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Poll question…"
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600">
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="text-xs font-medium text-brand-600 hover:underline">
                + Add option
              </button>
            )}
          </div>
          {formError && <p className="text-sm text-rose-600">{formError}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
              {saving ? "Creating…" : "Create Poll"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError("");
              }}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
      ) : polls.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
          <BarChart3 size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No polls yet — create one to push a live vote to the room.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((p) => {
            const total = p.options.reduce((sum, o) => sum + o.voteCount, 0);
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_PILL[p.status]}`}>{p.status}</span>
                    <p className="font-medium text-slate-900 text-sm">{p.question}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.status !== "open" && (
                      <button onClick={() => handleSetStatus(p.id, "open")} disabled={busyId === p.id} className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">
                        <Play size={11} /> Open
                      </button>
                    )}
                    {p.status === "open" && (
                      <button onClick={() => handleSetStatus(p.id, "closed")} disabled={busyId === p.id} className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline disabled:opacity-50">
                        <Square size={11} /> Close
                      </button>
                    )}
                    <button onClick={() => handleDelete(p.id)} disabled={busyId === p.id} className="text-slate-400 hover:text-rose-600 disabled:opacity-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {p.options.map((o) => {
                    const pct = total > 0 ? Math.round((o.voteCount / total) * 100) : 0;
                    return (
                      <div key={o.id}>
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                          <span>{o.label}</span>
                          <span className="tabular-nums">
                            {o.voteCount} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
