"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Edit2, LogOut, Plus, Trash2, X } from "lucide-react";
import { Destination, StaffRecord, University } from "@/lib/types";
import { PersistError, addStaff, deleteStaff, forceLogoutRep, updateStaff } from "@/lib/store";
import { Reveal } from "@/components/reveal";

/** University-rep account management — moved here from the old org-wide Settings
 *  page since reps only exist for the Education Fair template (destination +
 *  university assignment). Reps are scoped to exactly one event, same as
 *  destinations/universities — a rep created for one fair never shows up on, or
 *  can sign into, a different one. */
export function RepsManagement({ eventId, staff, destinations, universities }: { eventId: string; staff: StaffRecord[]; destinations: Destination[]; universities: University[] }) {
  const emptyRep = { id: "", name: "", email: "", destinationId: "", universityId: "", eventId };
  const reps = staff.filter((s) => s.role === "rep" && s.eventId === eventId);
  const [repForm, setRepForm] = useState(emptyRep);
  const [showRepForm, setShowRepForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const repUnis = repForm.destinationId ? universities.filter((u) => u.destinationId === repForm.destinationId) : [];

  async function handleDelete(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't complete that action. Please try again.");
    }
  }

  const handleAddRep = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...repForm, role: "rep" as const, isOnline: false };
    setFormError("");
    setSaving(true);
    try {
      await (repForm.id ? updateStaff(repForm.id, payload) : addStaff(payload));
      setShowRepForm(false);
      setRepForm(emptyRep);
      toast.success(repForm.id ? "Rep updated" : "Rep added");
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-slate-800 min-w-0">University Reps ({reps.length})</h2>
        <button
          onClick={() => {
            setRepForm(emptyRep);
            setShowRepForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-transform active:scale-[0.97] shrink-0 whitespace-nowrap"
          style={{ background: "#1B512D" }}
        >
          <Plus size={14} />
          Add Rep
        </button>
      </div>
      {reps.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
          <p className="font-medium text-slate-500">No university reps yet</p>
          <p className="text-xs text-slate-400 mt-1.5">Add one so a university&apos;s own representative can sign in and see just their leads.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reps.map((s, i) => {
            const dest = s.destinationId ? destinations.find((d) => d.id === s.destinationId) : null;
            const uni = s.universityId ? universities.find((u) => u.id === s.universityId) : null;
            return (
              <Reveal key={s.id} index={i}>
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#1B512D]/30 hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-full bg-[#1B512D]/10 flex items-center justify-center text-[#1B512D] font-semibold shrink-0">{s.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      {s.name}
                      {s.isOnline && (
                        <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Online
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">{s.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Rep</span>
                    {dest && <span className="px-2 py-0.5 rounded-full bg-[#1B512D]/10 text-[#1B512D] hidden sm:inline-block">{dest.name}</span>}
                    {uni && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">{uni.name}</span>}
                  </div>
                  <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                    {s.isOnline && (
                      <button onClick={() => handleDelete(() => forceLogoutRep(s.id), `${s.name} signed out`)} title="Force Logout" className="p-1.5 text-slate-400 hover:text-amber-600 rounded-md hover:bg-amber-50">
                        <LogOut size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRepForm({ id: s.id, name: s.name, email: s.email, destinationId: s.destinationId || "", universityId: s.universityId || "", eventId });
                        setShowRepForm(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-[#1B512D] rounded-md hover:bg-slate-100"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(() => deleteStaff(s.id), `${s.name} removed`)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {showRepForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{repForm.id ? "Edit Rep" : "Add Rep"}</h2>
              <button onClick={() => setShowRepForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddRep} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Rep Name</label>
                <input
                  required
                  value={repForm.name}
                  onChange={(e) => setRepForm({ ...repForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  required
                  type="email"
                  value={repForm.email}
                  onChange={(e) => setRepForm({ ...repForm, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination</label>
                <select
                  required
                  value={repForm.destinationId}
                  onChange={(e) => setRepForm({ ...repForm, destinationId: e.target.value, universityId: "" })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D] bg-white"
                >
                  <option value="">Select destination</option>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">University Name</label>
                <select
                  required
                  value={repForm.universityId}
                  onChange={(e) => setRepForm({ ...repForm, universityId: e.target.value })}
                  disabled={!repForm.destinationId}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D] bg-white disabled:opacity-50"
                >
                  <option value="">Select university</option>
                  {repUnis.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRepForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                  style={{ background: "#1B512D" }}
                >
                  {saving ? "Saving…" : "Save Rep"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
