"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Calendar, Copy, MapPin, Users, Download, Edit2, KeyRound, Loader2, X, Search } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { PersistError, duplicateEvent, getEventById, updateEvent, useDataReady, useDestinations, useEvents, useLeads, useUniversities } from "@/lib/store";
import { EventRecord, Role, getEventStatus } from "@/lib/types";
import { downloadCsv, leadsToCsv } from "@/lib/csv";
import { compressImageFile, formatTime } from "@/lib/utils";

const ADMIN_ONLY: Role[] = ["admin"];

export default function EventDetailPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  useEvents(); // subscribe so edits refresh this view
  const dataReady = useDataReady();
  const event = getEventById(params.id);
  const leads = useLeads().filter((l) => l.eventId === params.id);
  const destinations = useDestinations();
  const universities = useUniversities();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EventRecord | null>(null);

  const [search, setSearch] = useState("");
  const [filterDest, setFilterDest] = useState("");
  const [filterUni, setFilterUni] = useState("");
  const [imgError, setImgError] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // A freshly duplicated event lands here with ?edit=1 so the admin can
  // adjust the copy (name, dates, venue) immediately instead of hunting
  // for the Edit button.
  useEffect(() => {
    if (event && searchParams.get("edit") === "1") {
      // Deliberate: syncing local UI state to a one-time URL signal from
      // navigation, not a derived-state anti-pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditForm({ ...event });
      setIsEditing(true);
      router.replace(`/events/${event.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  async function handleDuplicate() {
    if (!event) return;
    setDuplicating(true);
    try {
      const copy = await duplicateEvent(event.id);
      if (copy) router.push(`/events/${copy.id}?edit=1`);
    } finally {
      setDuplicating(false);
    }
  }

  if (!session) return null;

  if (!event) {
    if (!dataReady) return null;
    return (
      <Shell>
        <div className="p-8 text-center text-slate-500">
          <p>Event not found.</p>
          <Link href="/dashboard" className="text-[#610064] mt-2 inline-block">
            ← Back to events
          </Link>
        </div>
      </Shell>
    );
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    setSaveError("");
    setSaving(true);
    try {
      await updateEvent(event.id, {
        ...editForm,
        staffAccessCode: editForm.staffAccessCode?.trim() || undefined,
        repAccessCode: editForm.repAccessCode?.trim() || undefined,
      });
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof PersistError ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const eventDests = destinations.filter((d) => event.destinationIds.includes(d.id));
  const availableUnis = filterDest ? universities.filter((u) => u.destinationId === filterDest) : universities;

  const filteredLeads = leads.filter((l) => {
    if (filterDest && l.destinationId !== filterDest) return false;
    if (filterUni && l.universityId !== filterUni) return false;
    if (search) {
      const q = search.toLowerCase();
      const full = `${l.firstName} ${l.lastName} ${l.email} ${l.phone}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    return true;
  });

  const activeFilters = [filterDest, filterUni, search].filter(Boolean).length;
  const clearFilters = () => {
    setFilterDest("");
    setFilterUni("");
    setSearch("");
  };

  const byDestination = eventDests.map((dest) => ({
    dest,
    leads: filteredLeads.filter((l) => l.destinationId === dest.id),
  }));

  const status = getEventStatus(event);
  const statusColor = {
    active: "bg-teal-100 text-teal-700",
    upcoming: "bg-amber-100 text-amber-700",
    completed: "bg-slate-100 text-slate-500",
  }[status];

  return (
    <Shell>
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
          <ArrowLeft size={15} />
          Back to events
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex-1 min-w-0">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mb-3 ${statusColor}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <h1 className="font-display text-2xl text-slate-900 mb-3">{event.name}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  {event.endDate && ` – ${new Date(event.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                  {event.startTime && ` • ${formatTime(event.startTime)}`}
                  {event.endTime && ` - ${formatTime(event.endTime)}`}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {event.venue}, {event.location}
                </span>
              </div>
              <p className="text-slate-600 text-sm mt-3">{event.description}</p>
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDuplicate}
                  disabled={duplicating}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
                >
                  <Copy size={14} />
                  {duplicating ? "Duplicating…" : "Duplicate"}
                </button>
                <button
                  onClick={() => {
                    setEditForm({ ...event });
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Edit2 size={14} />
                  Edit Event
                </button>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold text-slate-900">{filteredLeads.length}</p>
                <p className="text-xs text-slate-500">total leads</p>
              </div>
            </div>
          </div>

          {event.coverImage && !imgError && (
            <div className="mt-5 w-full h-48 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
            </div>
          )}

          {eventDests.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm mb-1">Participating institutions</h2>
              <p className="text-xs text-slate-500 mb-3">Universities set up for each destination this event covers.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {eventDests.map((d) => {
                  const count = universities.filter((u) => u.destinationId === d.id).length;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setFilterDest(d.id);
                        setFilterUni("");
                        document.getElementById("leads-filters")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="text-left bg-slate-50 hover:bg-[#610064]/5 border border-slate-200 hover:border-[#610064]/30 rounded-xl px-4 py-3 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <span className="text-base leading-none">{d.flag}</span>
                        {d.name}
                      </span>
                      <span className={`mt-1 block text-sm font-medium ${count > 0 ? "text-[#610064]" : "text-slate-400"}`}>
                        {count} {count === 1 ? "university" : "universities"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-slate-100">
            <button
              onClick={() => downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_all_leads.csv`, leadsToCsv(filteredLeads))}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#610064" }}
            >
              <Download size={14} />
              Export All Leads
            </button>
          </div>
        </div>

        <div id="leads-filters" className="bg-white rounded-xl border border-slate-200 p-4 mb-5 scroll-mt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
              />
            </div>
            <select
              value={filterDest}
              onChange={(e) => {
                setFilterDest(e.target.value);
                setFilterUni("");
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white"
            >
              <option value="">All Destinations</option>
              {eventDests.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.flag} {d.name}
                </option>
              ))}
            </select>
            <select
              value={filterUni}
              onChange={(e) => setFilterUni(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white min-w-[160px]"
            >
              <option value="">All Universities</option>
              {availableUnis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.shortName}
                </option>
              ))}
            </select>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 border border-rose-100">
                <X size={13} />
                Clear ({activeFilters})
              </button>
            )}
          </div>
        </div>

        {byDestination.map(({ dest, leads: dLeads }) => {
          if (dLeads.length === 0) return null;
          return (
            <div key={dest.id} className="bg-white rounded-2xl border border-slate-200 mb-4 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{dest.flag}</span>
                  <div>
                    <h2 className="font-semibold text-slate-900">{dest.name}</h2>
                    <p className="text-xs text-slate-500">
                      {dLeads.length} lead{dLeads.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => downloadCsv(`${dest.name.replace(/\s+/g, "_")}_leads.csv`, leadsToCsv(dLeads))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Download size={12} />
                  Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Name", "Email", "Phone", "University", "Course", "Level", "Start", "IELTS"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {lead.firstName} {lead.lastName}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{lead.email}</td>
                        <td className="px-4 py-3 text-slate-500">{lead.phone}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                          {universities.find((u) => u.id === lead.universityId)?.shortName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{lead.preferredCourse}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "#e8f0fe", color: "#1a3a6e" }}>
                            {lead.levelOfInterest}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{lead.startYear}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              lead.takenIELTS === "Yes" ? "bg-teal-100 text-teal-700" : lead.takenIELTS === "Registered" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {lead.takenIELTS}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {filteredLeads.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Users size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No leads found</p>
            {activeFilters > 0 ? <p className="text-sm mt-1">Try adjusting your filters</p> : <p className="text-sm mt-1">Leads collected by staff will appear here</p>}
          </div>
        )}

        {isEditing && editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900 text-lg">Edit Event</h2>
                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Event Name</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
                    <input
                      required
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={editForm.endDate || ""}
                      onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={editForm.startTime || ""}
                      onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={editForm.endTime || ""}
                      onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Venue</label>
                  <input
                    required
                    value={editForm.venue}
                    onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                  <input
                    required
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Destinations</label>
                  <div className="grid grid-cols-2 gap-2">
                    {destinations.map((d) => {
                      const checked = editForm.destinationIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            checked ? "border-[#610064] bg-[#610064]/5" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setEditForm({
                                ...editForm,
                                destinationIds: checked
                                  ? editForm.destinationIds.filter((x) => x !== d.id)
                                  : [...editForm.destinationIds, d.id],
                              });
                            }}
                            className="sr-only"
                          />
                          <span className="text-base">{d.flag}</span>
                          <span className="text-sm text-slate-700">{d.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cover Image</label>
                  <div className="space-y-3">
                    {editForm.coverImage && (
                      <div className="w-full h-32 rounded-lg overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editForm.coverImage} alt="Cover preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <input
                      type="url"
                      value={editForm.coverImage || ""}
                      onChange={(e) => {
                        setImageUploadError("");
                        setEditForm({ ...editForm, coverImage: e.target.value });
                      }}
                      placeholder="Paste image URL..."
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-500">or</span>
                      <label className="cursor-pointer flex-1 text-center py-2 px-3 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-[#610064] transition-colors">
                        {imageUploading ? (
                          <span className="inline-flex items-center gap-1.5 justify-center">
                            <Loader2 size={14} className="animate-spin" />
                            Compressing image…
                          </span>
                        ) : (
                          "Upload from device"
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
                            setImageUploadError("");
                            setImageUploading(true);
                            try {
                              const dataUrl = await compressImageFile(file);
                              setEditForm({ ...editForm, coverImage: dataUrl });
                            } catch (err) {
                              setImageUploadError(err instanceof Error ? err.message : "Couldn't process that image.");
                            } finally {
                              setImageUploading(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                    {imageUploadError && (
                      <p className="flex items-start gap-1.5 text-xs text-rose-600">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" />
                        {imageUploadError}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                    <KeyRound size={13} className="text-slate-400" />
                    Access codes <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-2">Staff and reps must enter the matching code before they can check in for this event.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Staff code</label>
                      <input
                        value={editForm.staffAccessCode || ""}
                        onChange={(e) => setEditForm({ ...editForm, staffAccessCode: e.target.value })}
                        placeholder="e.g. STAFF2026"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Rep code</label>
                      <input
                        value={editForm.repAccessCode || ""}
                        onChange={(e) => setEditForm({ ...editForm, repAccessCode: e.target.value })}
                        placeholder="e.g. REP2026"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                  </div>
                </div>
                {saveError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {saveError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ background: "#610064" }}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
