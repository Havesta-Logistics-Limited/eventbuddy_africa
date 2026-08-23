"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Copy, Edit2, Plus, Trash2, X } from "lucide-react";
import { Destination, University } from "@/lib/types";
import { PersistError, addDestination, addUniversity, copyDestinationsFromEvent, deleteDestination, deleteUniversity, updateDestination, updateUniversity } from "@/lib/store";
import { Reveal } from "@/components/reveal";
import { flagForCountryName } from "@/lib/country-flags";

const EMPTY_UNI = { id: "", name: "", shortName: "", destinationId: "" };

/** Destination-country and exhibiting-university catalog management — moved here
 *  from the old org-wide Settings page since both only exist for the Education Fair
 *  template. Each Education Fair event owns its own independent list now (see the
 *  Destination type) — `otherEvents` lists this org's other Education Fair events
 *  so an admin can optionally copy a past event's list as a starting point instead
 *  of building one from scratch. */
export function DestinationsUniversitiesManagement({
  eventId,
  destinations,
  universities,
  otherEvents,
}: {
  eventId: string;
  destinations: Destination[];
  universities: University[];
  otherEvents: { id: string; name: string }[];
}) {
  const emptyDest = { id: "", name: "", flag: "", eventId };
  const [uniForm, setUniForm] = useState(EMPTY_UNI);
  const [destForm, setDestForm] = useState(emptyDest);
  const [showUniForm, setShowUniForm] = useState(false);
  const [showDestForm, setShowDestForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");
  const [copying, setCopying] = useState(false);

  async function handleDelete(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't complete that action. Please try again.");
    }
  }

  async function handleCopy() {
    if (!copySourceId) return;
    setCopying(true);
    try {
      await copyDestinationsFromEvent(copySourceId, eventId);
      toast.success("Destinations and universities copied");
      setCopySourceId("");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't copy that event's list. Please try again.");
    } finally {
      setCopying(false);
    }
  }

  const handleAddUni = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await (uniForm.id ? updateUniversity(uniForm.id, uniForm) : addUniversity(uniForm));
      setShowUniForm(false);
      setUniForm(EMPTY_UNI);
      toast.success(uniForm.id ? "University updated" : "University added");
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddDest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await (destForm.id ? updateDestination(destForm.id, destForm) : addDestination(destForm));
      setShowDestForm(false);
      setDestForm(emptyDest);
      toast.success(destForm.id ? "Destination updated" : "Destination added");
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-800 min-w-0">Destinations ({destinations.length})</h2>
            <p className="text-xs text-slate-400 mt-0.5">Specific to this event — other events have their own lists.</p>
          </div>
          <button
            onClick={() => {
              setDestForm(emptyDest);
              setFormError("");
              setShowDestForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-transform active:scale-[0.97] shrink-0 whitespace-nowrap"
            style={{ background: "#1B512D" }}
          >
            <Plus size={14} />
            Add Destination
          </button>
        </div>
        {otherEvents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <Copy size={14} className="text-slate-400 shrink-0" />
            <span className="text-sm text-slate-500 shrink-0">Copy destinations &amp; universities from</span>
            <select
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
            >
              <option value="">Select a past event…</option>
              {otherEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleCopy}
              disabled={!copySourceId || copying}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-transform active:scale-[0.97] shrink-0"
              style={{ background: "#1B512D" }}
            >
              {copying ? "Copying…" : "Copy"}
            </button>
          </div>
        )}
        {destinations.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">No destinations yet — add the countries this fair covers, or copy them from a past event above.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {destinations.map((d, i) => {
              const uniCount = universities.filter((u) => u.destinationId === d.id).length;
              return (
                <Reveal key={d.id} index={i}>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#1B512D]/30 transition-colors">
                    <span className="text-3xl shrink-0">{d.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{d.name}</p>
                      <p className="text-sm text-slate-400">
                        {uniCount} universit{uniCount !== 1 ? "ies" : "y"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => {
                          setDestForm({ id: d.id, name: d.name, flag: d.flag, eventId: d.eventId });
                          setFormError("");
                          setShowDestForm(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-[#1B512D] rounded-md hover:bg-slate-100"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(() => deleteDestination(d.id), `${d.name} removed`)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-800 min-w-0">Universities ({universities.length})</h2>
            <p className="text-xs text-slate-400 mt-0.5">Exhibiting universities, grouped by destination.</p>
          </div>
          <button
            onClick={() => {
              setUniForm(EMPTY_UNI);
              setFormError("");
              setShowUniForm(true);
            }}
            disabled={destinations.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-transform active:scale-[0.97] shrink-0 whitespace-nowrap disabled:opacity-50"
            style={{ background: "#1B512D" }}
          >
            <Plus size={14} />
            Add University
          </button>
        </div>
        {destinations.length === 0 ? (
          <p className="text-sm text-slate-400">Add a destination first, then its exhibiting universities.</p>
        ) : (
          destinations.map((dest) => {
            const unis = universities.filter((u) => u.destinationId === dest.id);
            if (unis.length === 0) return null;
            return (
              <div key={dest.id} className="mb-5">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {dest.flag} {dest.name}
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {unis.map((u, i) => (
                    <Reveal key={u.id} index={i}>
                      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 group hover:border-[#1B512D]/30 hover:shadow-sm transition-all">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">{u.shortName.slice(0, 3)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.shortName}</p>
                        </div>
                        <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => {
                              setUniForm({ id: u.id, name: u.name, shortName: u.shortName, destinationId: u.destinationId });
                              setFormError("");
                              setShowUniForm(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-[#1B512D] rounded-md hover:bg-slate-100"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(() => deleteUniversity(u.id), `${u.name} removed`)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showDestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-slate-900">{destForm.id ? "Edit Destination" : "Add Destination"}</h2>
              <button onClick={() => setShowDestForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddDest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination Name</label>
                <input
                  required
                  value={destForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const autoFlag = flagForCountryName(name);
                    setDestForm((prev) => ({ ...prev, name, flag: autoFlag ?? prev.flag }));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
                  placeholder="e.g. United Kingdom"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Flag (Emoji)</label>
                <input
                  required
                  value={destForm.flag}
                  onChange={(e) => setDestForm({ ...destForm, flag: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
                  placeholder="e.g. 🇬🇧"
                />
                <p className="text-xs text-slate-400 mt-1">Auto-filled for recognized countries — edit if this destination isn&apos;t one.</p>
              </div>
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDestForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                  style={{ background: "#1B512D" }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUniForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-slate-900">{uniForm.id ? "Edit University" : "Add University"}</h2>
              <button onClick={() => setShowUniForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddUni} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination</label>
                <select
                  required
                  value={uniForm.destinationId}
                  onChange={(e) => setUniForm({ ...uniForm, destinationId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D] bg-white"
                >
                  <option value="">Select destination</option>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.flag} {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">University Name</label>
                <input
                  required
                  value={uniForm.name}
                  onChange={(e) => setUniForm({ ...uniForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
                  placeholder="e.g. University of Oxford"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Short Name / Abbreviation <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  value={uniForm.shortName}
                  onChange={(e) => setUniForm({ ...uniForm, shortName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
                  placeholder="e.g. Oxford — defaults to the full name if left blank"
                />
              </div>
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowUniForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                  style={{ background: "#1B512D" }}
                >
                  {saving ? "Saving…" : uniForm.id ? "Save Changes" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
