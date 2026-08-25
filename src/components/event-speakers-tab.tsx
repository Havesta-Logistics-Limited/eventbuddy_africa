"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic2, Plus, Trash2, X } from "lucide-react";
import { EventSpeaker } from "@/lib/types";
import { PersistError, addEventSpeaker, deleteEventSpeaker, updateEventSpeaker } from "@/lib/store";
import { compressImageFile } from "@/lib/utils";

const EMPTY_FORM = { id: "", name: "", title: "", company: "", bio: "", photoUrl: "" };

/** The Speakers tab of an event's Hub setup — the roster shown on the public Event
 *  Hub and used to populate the "assign speaker" picker on the Schedule tab. */
export function SpeakersTab({ eventId, speakers }: { eventId: string; speakers: EventSpeaker[] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }
  function openEdit(s: EventSpeaker) {
    setForm({ id: s.id, name: s.name, title: s.title || "", company: s.company || "", bio: s.bio || "", photoUrl: s.photoUrl || "" });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Enter the speaker's name.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        eventId,
        name: form.name.trim(),
        title: form.title.trim() || undefined,
        company: form.company.trim() || undefined,
        bio: form.bio.trim() || undefined,
        photoUrl: form.photoUrl || undefined,
      };
      if (form.id) {
        await updateEventSpeaker(form.id, payload);
        toast.success("Speaker updated");
      } else {
        await addEventSpeaker(payload);
        toast.success("Speaker added");
      }
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save this speaker. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteEventSpeaker(id);
      toast.success("Speaker removed");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't remove this speaker.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">{speakers.length} speaker{speakers.length !== 1 ? "s" : ""}</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
        >
          <Plus size={14} />
          Add Speaker
        </button>
      </div>

      {speakers.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
          <Mic2 size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No speakers yet — add your first one, then assign them to a session.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {speakers.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center text-slate-400 font-semibold">
                  {s.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    s.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                  {(s.title || s.company) && (
                    <p className="text-xs text-slate-500 truncate">
                      {s.title}
                      {s.title && s.company ? ", " : ""}
                      {s.company}
                    </p>
                  )}
                </div>
              </div>
              {s.bio && <p className="text-xs text-slate-600 mt-3 line-clamp-3">{s.bio}</p>}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => openEdit(s)} className="text-xs font-medium text-brand-600 hover:underline">
                  Edit
                </button>
                <button onClick={() => handleDelete(s.id)} disabled={busyId === s.id} className="text-slate-400 hover:text-rose-600 disabled:opacity-50 ml-auto">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{form.id ? "Edit Speaker" : "Add Speaker"}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center text-slate-400 text-xl font-semibold">
                  {form.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    form.name.charAt(0).toUpperCase() || "?"
                  )}
                </div>
                <label className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                  {imageUploading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Uploading…
                    </span>
                  ) : (
                    "Upload photo"
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imageUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setImageUploading(true);
                      try {
                        const dataUrl = await compressImageFile(file, 320, 0.82);
                        setForm((f) => ({ ...f, photoUrl: dataUrl }));
                      } catch {
                        setFormError("Couldn't process that image.");
                      } finally {
                        setImageUploading(false);
                      }
                    }}
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. CEO"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Company</label>
                  <input
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Bio</label>
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              {formError && <p className="text-sm text-rose-600">{formError}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add Speaker"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
