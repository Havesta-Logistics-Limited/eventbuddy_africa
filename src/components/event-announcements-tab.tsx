"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, Pin, PinOff, Plus, Trash2, Mail } from "lucide-react";
import { EventAnnouncement } from "@/lib/types";
import { PersistError, addAnnouncement, deleteAnnouncement, updateAnnouncement } from "@/lib/store";
import { RichTextEditor } from "@/components/rich-text-editor";
import { RichTextDisplay } from "@/components/rich-text-display";
import { stripHtml } from "@/lib/rich-text";

/** The Announcements tab — one-way organizer broadcasts shown on the public Event
 *  Hub, reverse-chronological with pinned items first. Deliberately not attendee-
 *  postable (see the Event Hub build plan: this is a broadcast channel, not a feed).
 *  "Also email attendees" additionally pushes the same update straight to every
 *  confirmed attendee's inbox (see /api/orgs/[slug]/events/[eventId]/broadcast) —
 *  posting to the Hub alone is pull-based, an attendee only sees it if they open
 *  the link again. */
export function AnnouncementsTab({ eventId, orgSlug, announcements }: { eventId: string; orgSlug: string; announcements: EventAnnouncement[] }) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripHtml(body).trim()) {
      setFormError("Write something to post.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await addAnnouncement({ eventId, body: body.trim(), pinned: false });
      if (alsoEmail) {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/broadcast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: subject.trim() || undefined, body: body.trim() }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error || "Posted, but couldn't email attendees.");
        } else {
          toast.success(`Posted, and emailed ${json.sentCount} of ${json.totalCount} attendee${json.totalCount !== 1 ? "s" : ""}`);
        }
      } else {
        toast.success("Announcement posted");
      }
      setBody("");
      setSubject("");
      setAlsoEmail(false);
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
          <RichTextEditor value={body} onChange={setBody} placeholder="Share an update with everyone registered for this event…" minHeightClass="min-h-[70px]" />
          <label className="flex items-center gap-2 mt-3 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            <Mail size={13} className="text-slate-400" />
            Also email every confirmed attendee
          </label>
          {alsoEmail && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Subject (defaults to "Update from your event")`}
              className="w-full mt-2 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          )}
          {formError && <p className="text-sm text-rose-600 mt-2">{formError}</p>}
          <div className="flex items-center gap-2 mt-3">
            <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
              {saving ? (alsoEmail ? "Posting & emailing…" : "Posting…") : alsoEmail ? "Post & Email" : "Post"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setBody("");
                setSubject("");
                setAlsoEmail(false);
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
                <RichTextDisplay html={a.body} className="text-sm text-slate-700" />
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
