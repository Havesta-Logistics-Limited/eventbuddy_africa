"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Calendar, MapPin, Users, Clock, CheckCircle2, AlertCircle, X, Search, SlidersHorizontal, KeyRound } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { PersistError, addEvent, useDestinations, useEvents, useLeads } from "@/lib/store";
import { EventRecord, EventStatus, Role, getEventStatus } from "@/lib/types";
import { formatTime, getEventCity, getEventMonthLabel, sortEventsByProximity } from "@/lib/utils";
import { DestinationFlags } from "@/components/destination-flags";
import { EventFilterModal } from "@/components/event-filter-modal";

const ADMIN_ONLY: Role[] = ["admin"];

const statusConfig: Record<EventStatus, { label: string; color: string; icon: typeof AlertCircle; dot: string }> = {
  active: { label: "Active", color: "bg-teal-100 text-teal-700", icon: AlertCircle, dot: "bg-teal-500" },
  upcoming: { label: "Upcoming", color: "bg-amber-100 text-amber-700", icon: Clock, dot: "bg-amber-500" },
  completed: { label: "Completed", color: "bg-slate-100 text-slate-500", icon: CheckCircle2, dot: "bg-slate-400" },
};

function EventCard({ event }: { event: EventRecord }) {
  const leads = useLeads().filter((l) => l.eventId === event.id);
  const destinations = useDestinations();
  const status = getEventStatus(event);
  const cfg = statusConfig[status];
  const eventDests = destinations.filter((d) => event.destinationIds.includes(d.id));
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      href={`/events/${event.id}`}
      className="h-full bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-[#610064]/30 transition-all flex flex-col"
    >
      <div className="h-32 bg-slate-100 relative">
        {event.coverImage && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-slate-100" />
        )}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color} shadow-sm bg-white/90 backdrop-blur-sm`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-slate-900 text-base mb-2 leading-snug">{event.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
          <Calendar size={12} className="shrink-0" />
          {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {event.endDate && ` – ${new Date(event.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}
        </div>
        {(event.startTime || event.endTime) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
            <Clock size={12} className="shrink-0" />
            {event.startTime && formatTime(event.startTime)}
            {event.endTime && ` - ${formatTime(event.endTime)}`}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-5">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">
            {event.venue}, {event.location}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-auto pt-4 border-t border-slate-100">
          <DestinationFlags destinations={eventDests} />
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 shrink-0">
            <Users size={14} className="text-slate-400" />
            {leads.length} leads
          </div>
        </div>
      </div>
    </Link>
  );
}

type NewEventForm = {
  name: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  venue: string;
  description: string;
  destinationIds: string[];
  staffAccessCode: string;
  repAccessCode: string;
};

const EMPTY_FORM: NewEventForm = {
  name: "",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  location: "",
  venue: "",
  description: "",
  destinationIds: [],
  staffAccessCode: "",
  repAccessCode: "",
};

export default function DashboardPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const events = useEvents();
  const destinations = useDestinations();
  const leads = useLeads();
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [search, setSearch] = useState("");
  const [destFilter, setDestFilter] = useState<string[]>([]);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewEventForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  if (!session) return null;

  const query = search.trim().toLowerCase();
  const filtered = events
    .filter((e) => filter === "all" || getEventStatus(e) === filter)
    .filter((e) => destFilter.length === 0 || e.destinationIds.some((id) => destFilter.includes(id)))
    .filter((e) => monthFilter.length === 0 || monthFilter.includes(getEventMonthLabel(e)))
    .filter((e) => locationFilter.length === 0 || locationFilter.includes(getEventCity(e)))
    .filter(
      (e) =>
        !query ||
        e.name.toLowerCase().includes(query) ||
        e.location.toLowerCase().includes(query) ||
        e.venue.toLowerCase().includes(query)
    );
  const sorted = sortEventsByProximity(filtered);

  const availableMonths = Array.from(new Set(events.map((e) => getEventMonthLabel(e)))).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const availableLocations = Array.from(new Set(events.map((e) => getEventCity(e)))).sort();
  const activeFilterCount = destFilter.length + monthFilter.length + locationFilter.length;

  const stats = [
    { label: "Total Events", value: events.length },
    { label: "Active", value: events.filter((e) => getEventStatus(e) === "active").length },
    { label: "Upcoming", value: events.filter((e) => getEventStatus(e) === "upcoming").length },
    { label: "Total Leads", value: leads.length },
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      await addEvent({
        ...form,
        staffAccessCode: form.staffAccessCode.trim() || undefined,
        repAccessCode: form.repAccessCode.trim() || undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setCreateError(err instanceof PersistError ? err.message : "Couldn't create that event. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Shell>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-slate-900">Events</h1>
            <p className="text-slate-500 text-sm mt-0.5">Manage your education fair schedule</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "#610064" }}
          >
            <Plus size={16} />
            New Event
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(["all", "active", "upcoming", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  filter === f ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events, venue, city..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
            />
          </div>

          <button
            onClick={() => setShowFilterModal(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
              activeFilterCount > 0
                ? "border-[#610064]/30 bg-[#610064]/5 text-[#610064]"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filter
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#610064] text-white text-[10px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <EventFilterModal
          open={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          destinations={destinations}
          selectedDestIds={destFilter}
          onToggleDest={(id) => setDestFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
          months={availableMonths}
          selectedMonths={monthFilter}
          onToggleMonth={(m) => setMonthFilter((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))}
          locations={availableLocations}
          selectedLocations={locationFilter}
          onToggleLocation={(l) => setLocationFilter((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))}
          onClear={() => {
            setDestFilter([]);
            setMonthFilter([]);
            setLocationFilter([]);
          }}
          resultCount={sorted.length}
          accent="purple"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
          {sorted.length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">
              <Calendar size={32} className="mx-auto mb-3 opacity-40" />
              <p>No events found</p>
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900 text-lg">Create New Event</h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Event Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Global Education Fair 2027 — Lagos"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
                    <input
                      required
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Venue</label>
                  <input
                    required
                    value={form.venue}
                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                    placeholder="e.g. Eko Hotel & Suites"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Location (City, Country)</label>
                  <input
                    required
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Lagos, Nigeria"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Destinations</label>
                  <div className="grid grid-cols-2 gap-2">
                    {destinations.map((d) => {
                      const checked = form.destinationIds.includes(d.id);
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
                              setForm((f) => ({
                                ...f,
                                destinationIds: checked ? f.destinationIds.filter((x) => x !== d.id) : [...f.destinationIds, d.id],
                              }));
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
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                    <KeyRound size={13} className="text-slate-400" />
                    Access codes <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-2">Staff and reps must enter the matching code before they can check in for this event.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Staff code</label>
                      <input
                        value={form.staffAccessCode}
                        onChange={(e) => setForm({ ...form, staffAccessCode: e.target.value })}
                        placeholder="e.g. STAFF2026"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Rep code</label>
                      <input
                        value={form.repAccessCode}
                        onChange={(e) => setForm({ ...form, repAccessCode: e.target.value })}
                        placeholder="e.g. REP2026"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                      />
                    </div>
                  </div>
                </div>
                {createError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {createError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ background: "#610064" }}
                  >
                    {creating ? "Creating…" : "Create Event"}
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
