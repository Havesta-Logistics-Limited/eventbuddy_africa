"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { EventAnnouncement } from "@/lib/types";
import { PersistError, addAnnouncement, deleteAnnouncement, updateAnnouncement } from "@/lib/store";

/** The Announcements tab — one-way organizer broadcasts shown on the public Event
 *  Hub, reverse-chronological with pinned items first. Deliberately not attendee-
 *  postable (see the Event Hub build plan: this is a broadcast channel, not a feed). */
export function AnnouncementsTab({ eventId, announcements }: { eventId: string; announcements: EventAnnouncement[] }) {
  const [body, setBody] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setFormError("Write something to post.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await addAnnouncement({ eventId, body: body.trim(), pinned: false });
      toast.success("Announcement posted");
      setBody("");
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't post this announcement. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePin(a: EventAnnouncement) {
    setBusyId(a.id);
    try {
      await updateAnnouncement(a.id, { pinned: !a.pinned });
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this announcement.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteAnnouncement(id);
      toast.success("Announcement deleted");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't delete this announcement.");
    } finally {
      setBusyId(null);
    }
  }

  const sorted = [...announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">{announcements.length} announcement{announcements.length !== 1 ? "s" : ""}</p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
          >
            <Plus size={14} />
            Post Announcement
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
            placeholder="Share an update with everyone registered for this event…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          {formError && <p className="text-sm text-rose-600 mt-2">{formError}</p>}
          <div className="flex items-center gap-2 mt-3">
            <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
              {saving ? "Posting…" : "Post"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setBody("");
                setFormError("");
              }}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
          <Megaphone size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <div key={a.id} className={`bg-white rounded-xl border p-4 ${a.pinned ? "border-brand-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-700 whitespace-pre-line">{a.body}</p>
                {a.pinned && <Pin size={13} className="text-brand-600 shrink-0 mt-0.5" />}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <button
                  onClick={() => handleTogglePin(a)}
                  disabled={busyId === a.id}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600 disabled:opacity-50"
                >
                  {a.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  {a.pinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => handleDelete(a.id)} disabled={busyId === a.id} className="text-slate-400 hover:text-rose-600 disabled:opacity-50 ml-auto">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
