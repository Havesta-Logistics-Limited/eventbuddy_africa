"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy, Plus, Users, UserCheck, Building2, Globe2, X, Edit2, Trash2, LogOut } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import {
  PersistError,
  addDestination,
  addStaff,
  addUniversity,
  deleteDestination,
  deleteStaff,
  deleteUniversity,
  forceLogoutRep,
  updateDestination,
  updateStaff,
  updateUniversity,
  useDestinations,
  useEvents,
  useStaff,
  useUniversities,
} from "@/lib/store";
import { Role } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";

const ADMIN_ONLY: Role[] = ["admin"];

type Tab = "staff" | "reps" | "universities" | "destinations";

const EMPTY_STAFF = { id: "", name: "", email: "", role: "staff" as const, destinationId: "", universityId: "", eventId: "" };
const EMPTY_UNI = { id: "", name: "", shortName: "", destinationId: "" };
const EMPTY_DEST = { id: "", name: "", flag: "" };
const EMPTY_REP = { id: "", name: "", email: "", destinationId: "", universityId: "" };

export default function AdminPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const staff = useStaff();
  const universities = useUniversities();
  const destinations = useDestinations();
  const events = useEvents();
  const [tab, setTab] = useState<Tab>("staff");

  const [staffForm, setStaffForm] = useState(EMPTY_STAFF);
  const [uniForm, setUniForm] = useState(EMPTY_UNI);
  const [destForm, setDestForm] = useState(EMPTY_DEST);
  const [repForm, setRepForm] = useState(EMPTY_REP);

  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showRepForm, setShowRepForm] = useState(false);
  const [showUniForm, setShowUniForm] = useState(false);
  const [showDestForm, setShowDestForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!session) return null;

  const staffUnis = staffForm.destinationId ? universities.filter((u) => u.destinationId === staffForm.destinationId) : [];
  const selectedStaffEvent = staffForm.eventId ? events.find((e) => e.id === staffForm.eventId) : undefined;
  const staffEventUsesDestinations = selectedStaffEvent ? getTemplate(selectedStaffEvent.templateId).usesDestinations : true;
  const repUnis = repForm.destinationId ? universities.filter((u) => u.destinationId === repForm.destinationId) : [];

  async function runSave(action: () => Promise<unknown>, onSuccess: () => void) {
    setFormError("");
    setSaving(true);
    try {
      await action();
      onSuccess();
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    runSave(
      () => (staffForm.id ? updateStaff(staffForm.id, staffForm) : addStaff(staffForm)),
      () => {
        setShowStaffForm(false);
        setStaffForm(EMPTY_STAFF);
      }
    );
  };

  const handleAddRep = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...repForm, role: "rep" as const, isOnline: false };
    runSave(
      () => (repForm.id ? updateStaff(repForm.id, payload) : addStaff(payload)),
      () => {
        setShowRepForm(false);
        setRepForm(EMPTY_REP);
      }
    );
  };

  const handleAddUni = (e: React.FormEvent) => {
    e.preventDefault();
    runSave(
      () => (uniForm.id ? updateUniversity(uniForm.id, uniForm) : addUniversity(uniForm)),
      () => {
        setShowUniForm(false);
        setUniForm(EMPTY_UNI);
      }
    );
  };

  const handleAddDest = (e: React.FormEvent) => {
    e.preventDefault();
    runSave(
      () => (destForm.id ? updateDestination(destForm.id, destForm) : addDestination(destForm)),
      () => {
        setShowDestForm(false);
        setDestForm(EMPTY_DEST);
      }
    );
  };

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "staff", label: "Staff", icon: Users },
    { id: "reps", label: "Reps", icon: UserCheck },
    { id: "universities", label: "Universities", icon: Building2 },
    { id: "destinations", label: "Destinations", icon: Globe2 },
  ];

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-slate-900">Settings</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage staff, universities, and destinations</p>
        </div>

        {session.orgSlug && <CheckinLinksCard orgSlug={session.orgSlug} />}

        <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {tab === "staff" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Team Members ({staff.filter((s) => s.role !== "rep").length})</h2>
              <button
                onClick={() => {
                  setStaffForm(EMPTY_STAFF);
                  setShowStaffForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#610064" }}
              >
                <Plus size={14} />
                Add Staff
              </button>
            </div>
            <div className="space-y-3">
              {staff
                .filter((s) => s.role !== "rep")
                .map((s) => {
                  const dest = s.destinationId ? destinations.find((d) => d.id === s.destinationId) : null;
                  const uni = s.universityId ? universities.find((u) => u.id === s.universityId) : null;
                  const ev = s.eventId ? events.find((e) => e.id === s.eventId) : null;
                  return (
                    <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#610064]/30 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-[#610064]/10 flex items-center justify-center text-[#610064] font-semibold shrink-0">{s.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900">{s.name}</p>
                        <p className="text-sm text-slate-500">{s.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span
                          className="px-2 py-0.5 rounded-full font-medium"
                          style={s.role === "admin" ? { background: "#e8f0fe", color: "#1a3a6e" } : { background: "#f1f5f9", color: "#475569" }}
                        >
                          {s.role}
                        </span>
                        {dest && <span className="px-2 py-0.5 rounded-full bg-[#610064]/10 text-[#610064] hidden sm:inline-block">{dest.flag} {dest.name}</span>}
                        {uni && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">{uni.shortName}</span>}
                        {ev && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 max-w-[120px] sm:max-w-[160px] truncate">{ev.name.split("—")[0].trim()}</span>}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                        <button
                          onClick={() => {
                            setStaffForm({
                              id: s.id,
                              name: s.name,
                              email: s.email,
                              role: "staff",
                              destinationId: s.destinationId || "",
                              universityId: s.universityId || "",
                              eventId: s.eventId || "",
                            });
                            setShowStaffForm(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-[#610064] rounded-md hover:bg-slate-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => deleteStaff(s.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {showStaffForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                  <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">{staffForm.id ? "Edit Staff" : "Add Staff Member"}</h2>
                    <button onClick={() => setShowStaffForm(false)}>
                      <X size={20} className="text-slate-400" />
                    </button>
                  </div>
                  <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                      <input
                        required
                        value={staffForm.name}
                        onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                      <input
                        required
                        type="email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Assigned Event</label>
                      <select
                        value={staffForm.eventId}
                        onChange={(e) => {
                          const ev = events.find((x) => x.id === e.target.value);
                          const usesDestinations = ev ? getTemplate(ev.templateId).usesDestinations : true;
                          setStaffForm({
                            ...staffForm,
                            eventId: e.target.value,
                            ...(usesDestinations ? {} : { destinationId: "", universityId: "" }),
                          });
                        }}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white"
                      >
                        <option value="">Select event</option>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {staffEventUsesDestinations && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination</label>
                          <select
                            value={staffForm.destinationId}
                            onChange={(e) => setStaffForm({ ...staffForm, destinationId: e.target.value, universityId: "" })}
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white"
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
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">University</label>
                          <select
                            value={staffForm.universityId}
                            onChange={(e) => setStaffForm({ ...staffForm, universityId: e.target.value })}
                            disabled={!staffForm.destinationId}
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white disabled:opacity-50"
                          >
                            <option value="">Select university</option>
                            {staffUnis.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {formError && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        {formError}
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={() => setShowStaffForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ background: "#610064" }}>
                        {saving ? "Saving…" : staffForm.id ? "Save Changes" : "Add Staff"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "reps" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">University Reps ({staff.filter((s) => s.role === "rep").length})</h2>
              <button
                onClick={() => {
                  setRepForm(EMPTY_REP);
                  setShowRepForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#610064" }}
              >
                <Plus size={14} />
                Add Rep
              </button>
            </div>
            <div className="space-y-3">
              {staff
                .filter((s) => s.role === "rep")
                .map((s) => {
                  const dest = s.destinationId ? destinations.find((d) => d.id === s.destinationId) : null;
                  const uni = s.universityId ? universities.find((u) => u.id === s.universityId) : null;
                  return (
                    <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#610064]/30 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-[#610064]/10 flex items-center justify-center text-[#610064] font-semibold shrink-0">{s.name.charAt(0)}</div>
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
                        {dest && <span className="px-2 py-0.5 rounded-full bg-[#610064]/10 text-[#610064] hidden sm:inline-block">{dest.name}</span>}
                        {uni && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">{uni.name}</span>}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                        {s.isOnline && (
                          <button onClick={() => forceLogoutRep(s.id)} title="Force Logout" className="p-1.5 text-slate-400 hover:text-amber-600 rounded-md hover:bg-amber-50">
                            <LogOut size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setRepForm({ id: s.id, name: s.name, email: s.email, destinationId: s.destinationId || "", universityId: s.universityId || "" });
                            setShowRepForm(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-[#610064] rounded-md hover:bg-slate-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => deleteStaff(s.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {showRepForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
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
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                      <input
                        required
                        type="email"
                        value={repForm.email}
                        onChange={(e) => setRepForm({ ...repForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination</label>
                      <select
                        required
                        value={repForm.destinationId}
                        onChange={(e) => setRepForm({ ...repForm, destinationId: e.target.value, universityId: "" })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white"
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
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white disabled:opacity-50"
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
                      <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ background: "#610064" }}>
                        {saving ? "Saving…" : "Save Rep"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "universities" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Universities ({universities.length})</h2>
              <button
                onClick={() => {
                  setUniForm(EMPTY_UNI);
                  setShowUniForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#610064" }}
              >
                <Plus size={14} />
                Add University
              </button>
            </div>
            {destinations.map((dest) => {
              const unis = universities.filter((u) => u.destinationId === dest.id);
              if (unis.length === 0) return null;
              return (
                <div key={dest.id} className="mb-5">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {dest.flag} {dest.name}
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {unis.map((u) => (
                      <div key={u.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 group hover:border-[#610064]/30 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">{u.shortName.slice(0, 3)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.shortName}</p>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => {
                            setUniForm({ id: u.id, name: u.name, shortName: u.shortName, destinationId: u.destinationId });
                            setShowUniForm(true);
                          }}
                            className="p-1.5 text-slate-400 hover:text-[#610064] rounded-md hover:bg-slate-100"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => deleteUniversity(u.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {showUniForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
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
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white"
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
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                        placeholder="e.g. University of Oxford"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Short Name / Abbreviation</label>
                      <input
                        required
                        value={uniForm.shortName}
                        onChange={(e) => setUniForm({ ...uniForm, shortName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                        placeholder="e.g. Oxford"
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
                      <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ background: "#610064" }}>
                        {saving ? "Saving…" : uniForm.id ? "Save Changes" : "Add"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "destinations" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Destinations ({destinations.length})</h2>
              <button
                onClick={() => {
                  setDestForm(EMPTY_DEST);
                  setShowDestForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#610064" }}
              >
                <Plus size={14} />
                Add Destination
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {destinations.map((d) => {
                const uniCount = universities.filter((u) => u.destinationId === d.id).length;
                return (
                  <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#610064]/30 transition-colors">
                    <span className="text-3xl shrink-0">{d.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{d.name}</p>
                      <p className="text-sm text-slate-400">
                        {uniCount} universit{uniCount !== 1 ? "ies" : "y"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => {
                          setDestForm({ id: d.id, name: d.name, flag: d.flag });
                          setShowDestForm(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-[#610064] rounded-md hover:bg-slate-100"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteDestination(d.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {showDestForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
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
                        onChange={(e) => setDestForm({ ...destForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                        placeholder="e.g. United Kingdom"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Flag (Emoji)</label>
                      <input
                        required
                        value={destForm.flag}
                        onChange={(e) => setDestForm({ ...destForm, flag: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                        placeholder="e.g. 🇬🇧"
                      />
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
                      <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ background: "#610064" }}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function CheckinLinksCard({ orgSlug }: { orgSlug: string }) {
  const [copied, setCopied] = useState<"staff" | "rep" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links = [
    { key: "staff" as const, label: "Staff check-in link", path: `/${orgSlug}/staff-setup` },
    { key: "rep" as const, label: "Rep check-in link", path: `/${orgSlug}/rep-login` },
  ];

  function copy(key: "staff" | "rep", url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Check-in links</h2>
      <p className="text-xs text-slate-500 mb-3">Share these with your team — staff and reps use them to check in, no admin login needed.</p>
      <div className="space-y-2">
        {links.map(({ key, label, path }) => {
          const url = `${origin}${path}`;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 truncate">
                <span className="text-slate-400">{label}:</span> {url}
              </div>
              <button
                type="button"
                onClick={() => copy(key, url)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 shrink-0"
              >
                {copied === key ? <Check size={13} className="text-teal-600" /> : <Copy size={13} />}
                {copied === key ? "Copied" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
