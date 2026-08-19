"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Calendar, Copy, Link2, MapPin, Users, Download, Edit2, Lock, LockOpen, Trash2, Video, X, Search } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import {
  PersistError,
  deleteEvent,
  duplicateEvent,
  getEventById,
  updateEvent,
  useDataReady,
  useDestinations,
  useEvents,
  useLeads,
  useRegistrations,
  useUniversities,
} from "@/lib/store";
import { Role } from "@/lib/types";
import { downloadCsv, eventLeadsToCsv, leadsToCsv } from "@/lib/csv";
import { formatTime } from "@/lib/utils";
import { getCaptureGate, getEventStatus, windowFromEvent } from "@/lib/capture-window";
import { EventWizard, type EventWizardData } from "@/components/event-wizard";
import { EventLeadsCard } from "@/components/event-leads-card";
import { RegistrationsCard } from "@/components/registrations-card";

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
  const registrations = useRegistrations().filter((r) => r.eventId === params.id);
  const destinations = useDestinations();
  const universities = useUniversities();

  const [isEditing, setIsEditing] = useState(false);

  const [search, setSearch] = useState("");
  const [filterDest, setFilterDest] = useState("");
  const [filterUni, setFilterUni] = useState("");
  const [imgError, setImgError] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // A freshly duplicated event lands here with ?edit=1 so the admin can
  // adjust the copy (name, dates, venue) immediately instead of hunting
  // for the Edit button.
  useEffect(() => {
    if (event && searchParams.get("edit") === "1") {
      // Deliberate: syncing local UI state to a one-time URL signal from
      // navigation, not a derived-state anti-pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  async function handleDelete() {
    if (!event) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      router.push("/dashboard");
    } catch (err) {
      setDeleteError(err instanceof PersistError ? err.message : "Couldn't delete this event. Please try again.");
      setDeleting(false);
    }
  }

  async function handleCopyLink() {
    if (!event || typeof window === "undefined") return;
    const link = `${window.location.origin}/${session?.orgSlug ?? ""}/events/${event.id}/register`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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

  const handleEditSubmit = async (data: EventWizardData) => {
    try {
      await updateEvent(event.id, data);
      setIsEditing(false);
    } catch (err) {
      throw err instanceof PersistError ? new Error(err.message) : new Error("Couldn't save your changes. Please try again.");
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

  const gate = getCaptureGate(windowFromEvent(event), event.timezone, event.captureOverride);

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
                {event.eventFormat === "virtual" ? (
                  <span className="flex items-center gap-1.5">
                    <Video size={14} />
                    {event.virtualPlatform ? `${event.virtualPlatform} — ` : ""}
                    <a href={event.virtualJoinUrl} target="_blank" rel="noreferrer" className="text-[#610064] hover:underline">
                      Join link
                    </a>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    {event.venue}, {event.location}
                  </span>
                )}
              </div>
              {event.eventFormat === "virtual" && event.virtualAccessNotes && (
                <p className="text-xs text-slate-400 mt-1">{event.virtualAccessNotes}</p>
              )}
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
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Edit2 size={14} />
                  Edit Event
                </button>
                <button
                  onClick={() => {
                    setDeleteError("");
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete
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

          <div className="mt-6 pt-5 border-t border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm mb-1">Lead capture</h2>
            <p className="text-xs text-slate-500">
              {gate.open ? (
                <span className="inline-flex items-center gap-1 text-teal-600 font-medium">
                  <LockOpen size={12} /> Currently accepting leads
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                  <Lock size={12} />
                  {gate.reason === "manually_closed" ? "Closed by platform admin" : gate.reason === "not_started" ? "Not open yet" : "Closed — event ended"}
                </span>
              )}
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm mb-1">Attendee registration</h2>
                <p className="text-xs text-slate-500">
                  {registrations.length} registered
                  {registrations.length > 0 && ` · ${registrations.filter((r) => r.status === "checked_in").length} checked in`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Link2 size={12} />
                {linkCopied ? "Link copied!" : "Copy registration link"}
              </button>
            </div>
          </div>

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
              onClick={() => downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_all_leads.csv`, eventLeadsToCsv(filteredLeads, event))}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#610064" }}
            >
              <Download size={14} />
              Export All Leads
            </button>
          </div>
        </div>

        {registrations.length > 0 && <RegistrationsCard event={event} registrations={registrations} />}

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

        {eventDests.length === 0 && filteredLeads.length > 0 && (
          <EventLeadsCard event={event} leads={filteredLeads} universities={universities} />
        )}

        {filteredLeads.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Users size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No leads found</p>
            {activeFilters > 0 ? <p className="text-sm mt-1">Try adjusting your filters</p> : <p className="text-sm mt-1">Leads collected by staff will appear here</p>}
          </div>
        )}

        {isEditing && (
          <EventWizard
            mode="edit"
            initialEvent={event}
            destinations={destinations}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditing(false)}
          />
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
              <h2 className="font-semibold text-slate-900 text-lg mb-2">Delete this event?</h2>
              <p className="text-sm text-slate-600">
                This permanently deletes <span className="font-semibold">{event.name}</span>
                {leads.length > 0 && (
                  <>
                    {" "}
                    and its <span className="font-semibold">{leads.length} collected lead{leads.length !== 1 ? "s" : ""}</span>
                  </>
                )}
                . This can&apos;t be undone.
              </p>
              {deleteError && (
                <div className="flex items-start gap-2 p-3 mt-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {deleteError}
                </div>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete Event"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
