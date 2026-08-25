"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Calendar, ChevronDown, MessageSquareText, Plus, Trash2, X } from "lucide-react";
import { EventSession, EventSpeaker, SessionType, SpeakerRole } from "@/lib/types";
import { PersistError, addEventSession, assignSpeakerToSession, deleteEventSession, removeSpeakerFromSession, updateEventSession } from "@/lib/store";

const SESSION_TYPES: { id: SessionType; label: string }[] = [
  { id: "session", label: "Session" },
  { id: "keynote", label: "Keynote" },
  { id: "panel", label: "Panel" },
  { id: "break", label: "Break" },
  { id: "networking", label: "Networking" },
];
const SPEAKER_ROLES: { id: SpeakerRole; label: string }[] = [
  { id: "speaker", label: "Speaker" },
  { id: "keynote", label: "Keynote" },
  { id: "moderator", label: "Moderator" },
  { id: "panelist", label: "Panelist" },
];

const EMPTY_FORM = { id: "", title: "", description: "", startTime: "", endTime: "", track: "", sessionType: "session" as SessionType };

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The Schedule tab of an event's Hub setup — sessions attendees see on the public
 *  Event Hub, each optionally carrying a track, a type, assigned speakers, and a
 *  live "Q&A open" switch the organizer flips on the day. */
export function ScheduleTab({ eventId, sessions, speakers }: { eventId: string; sessions: EventSession[]; speakers: EventSpeaker[] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignSpeakerId, setAssignSpeakerId] = useState("");
  const [assignRole, setAssignRole] = useState<SpeakerRole>("speaker");

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }
  function openEdit(s: EventSession) {
    setForm({
      id: s.id,
      title: s.title,
      description: s.description || "",
      startTime: toDatetimeLocalValue(s.startTime),
      endTime: s.endTime ? toDatetimeLocalValue(s.endTime) : "",
      track: s.track || "",
      sessionType: s.sessionType,
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.startTime) {
      setFormError("Give this session a title and a start time.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        eventId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        startTime: new Date(form.startTime).toISOString(),
        endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
        track: form.track.trim() || undefined,
        sessionType: form.sessionType,
        qaOpen: false,
      };
      if (form.id) {
        await updateEventSession(form.id, payload);
        toast.success("Session updated");
      } else {
        await addEventSession(payload);
        toast.success("Session added");
      }
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save this session. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteEventSession(id);
      toast.success("Session removed");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't remove this session.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleQa(s: EventSession) {
    setBusyId(s.id);
    try {
      await updateEventSession(s.id, { qaOpen: !s.qaOpen });
      toast.success(s.qaOpen ? "Q&A closed for this session" : "Q&A open — attendees can submit questions now");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this session.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssign(sessionId: string) {
    if (!assignSpeakerId) return;
    setBusyId(sessionId);
    try {
      await assignSpeakerToSession(sessionId, assignSpeakerId, assignRole);
      setAssigning(null);
      setAssignSpeakerId("");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't assign this speaker.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnassign(assignmentId: string, sessionId: string) {
    setBusyId(sessionId);
    try {
      await removeSpeakerFromSession(assignmentId);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't remove this speaker.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
        >
          <Plus size={14} />
          Add Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
          <Calendar size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No sessions yet — add your first one to start building the schedule.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const availableSpeakers = speakers.filter((sp) => !s.speakers.some((assigned) => assigned.speakerId === sp.id));
            return (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                        {SESSION_TYPES.find((t) => t.id === s.sessionType)?.label}
                      </span>
                      {s.track && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{s.track}</span>}
                    </div>
                    <p className="font-semibold text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(s.startTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {s.endTime && ` – ${new Date(s.endTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                    {s.description && <p className="text-sm text-slate-600 mt-2">{s.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleQa(s)}
                      disabled={busyId === s.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                        s.qaOpen ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                      title={s.qaOpen ? "Q&A is open — click to close" : "Q&A is closed — click to open"}
                    >
                      <MessageSquareText size={13} />
                      {s.qaOpen ? "Q&A open" : "Q&A closed"}
                    </button>
                    <button onClick={() => openEdit(s)} className="text-xs font-medium text-brand-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(s.id)} disabled={busyId === s.id} className="text-slate-400 hover:text-rose-600 disabled:opacity-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {s.speakers.map((sp) => (
                    <span key={sp.assignmentId} className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 pl-2.5 pr-1.5 py-1 rounded-full">
                      {sp.name}
                      <span className="text-slate-400">· {SPEAKER_ROLES.find((r) => r.id === sp.role)?.label}</span>
                      <button onClick={() => handleUnassign(sp.assignmentId, s.id)} className="text-slate-400 hover:text-rose-600">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  {assigning === s.id ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={assignSpeakerId}
                        onChange={(e) => setAssignSpeakerId(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1"
                      >
                        <option value="">Select speaker…</option>
                        {availableSpeakers.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name}
                          </option>
                        ))}
                      </select>
                      <select value={assignRole} onChange={(e) => setAssignRole(e.target.value as SpeakerRole)} className="text-xs border border-slate-200 rounded-lg px-2 py-1">
                        {SPEAKER_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssign(s.id)}
                        disabled={!assignSpeakerId || busyId === s.id}
                        className="text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-2.5 py-1 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button onClick={() => setAssigning(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    availableSpeakers.length > 0 && (
                      <button
                        onClick={() => {
                          setAssigning(s.id);
                          setAssignSpeakerId("");
                          setAssignRole("speaker");
                        }}
                        className="text-xs font-medium text-brand-600 hover:underline flex items-center gap-1"
                      >
                        <Plus size={12} /> Assign speaker
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{form.id ? "Edit Session" : "Add Session"}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Starts</label>
                  <input
                    type="datetime-local"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ends (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Track (optional)</label>
                  <input
                    value={form.track}
                    onChange={(e) => setForm((f) => ({ ...f, track: e.target.value }))}
                    placeholder="e.g. Main Stage"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <div className="relative">
                    <select
                      value={form.sessionType}
                      onChange={(e) => setForm((f) => ({ ...f, sessionType: e.target.value as SessionType }))}
                      className="w-full appearance-none px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      {SESSION_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              {formError && <p className="text-sm text-rose-600">{formError}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add Session"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
