"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Calendar, MapPin, Users, QrCode, Clock, CheckCircle2, AlertCircle, Search, SlidersHorizontal, Presentation } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { PersistError, addEvent, useDataReady, useDestinations, useEvents, useLeads, useRegistrations } from "@/lib/store";
import { EventRecord, EventStatus, Role } from "@/lib/types";
import { getEventStatus } from "@/lib/capture-window";
import { formatTime, getEventCity, getEventMonthLabel, sortEventsByProximity } from "@/lib/utils";
import { DestinationFlags } from "@/components/destination-flags";
import { EventFilterModal } from "@/components/event-filter-modal";
import { EventWizard, type EventWizardData } from "@/components/event-wizard";
import { Reveal } from "@/components/reveal";
import { EventCardSkeleton, StatTileSkeleton } from "@/components/skeleton";
import { AuthLoading } from "@/components/auth-loading";

const ADMIN_ONLY: Role[] = ["admin"];

// "Active" uses emerald rather than the app's legacy teal tokens (a pre-rebrand
// leftover still used elsewhere) so a live event's status never reads as the
// same color family as the purple brand accent.
const statusConfig: Record<EventStatus, { label: string; color: string; icon: typeof AlertCircle; dot: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700", icon: AlertCircle, dot: "bg-emerald-500" },
  upcoming: { label: "Upcoming", color: "bg-amber-100 text-amber-700", icon: Clock, dot: "bg-amber-500" },
  completed: { label: "Completed", color: "bg-slate-100 text-slate-500", icon: CheckCircle2, dot: "bg-slate-400" },
};

function EventCard({ event }: { event: EventRecord }) {
  const leads = useLeads().filter((l) => l.eventId === event.id);
  const registrations = useRegistrations().filter((r) => r.eventId === event.id);
  const destinations = useDestinations();
  const status = getEventStatus(event);
  const cfg = statusConfig[status];
  const eventDests = destinations.filter((d) => event.destinationIds.includes(d.id));
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      href={`/events/${event.id}`}
      className="h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:border-brand-600/30 transition-all flex flex-col"
    >
      <div className="aspect-video bg-slate-100 relative">
        {event.coverImage && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-slate-100" />
        )}
        <div className="absolute top-3 left-3">
          {event.published === false ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 shadow-sm bg-white/90 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Draft
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color} shadow-sm bg-white/90 backdrop-blur-sm`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          )}
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
          {event.eventFormat === "virtual" ? (
            <>
              <Presentation size={12} className="shrink-0" />
              <span className="truncate">{event.virtualPlatform || "Online"} (Virtual)</span>
            </>
          ) : (
            <>
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">
                {event.venue}, {event.location}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 mt-auto pt-4 border-t border-slate-100">
          <DestinationFlags destinations={eventDests} />
          <div className="flex items-center gap-3 shrink-0">
            {event.eventFormat !== "virtual" && registrations.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 tabular-nums">
                <QrCode size={14} className="text-slate-400" />
                {registrations.length}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 tabular-nums">
              <Users size={14} className="text-slate-400" />
              {leads.length} leads
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const dataReady = useDataReady();
  const events = useEvents();
  const destinations = useDestinations();
  const leads = useLeads();
  const [filter, setFilter] = useState<"all" | EventStatus | "draft">("all");
  const [search, setSearch] = useState("");
  const [destFilter, setDestFilter] = useState<string[]>([]);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Each card's Active/Upcoming/Completed badge is computed fresh on every render from
  // the current time, but nothing else re-renders this page as time passes — a tab left
  // open past an event's end time would keep showing "Active" forever. One interval
  // here re-renders every card at once, cheaper than one per EventCard.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!session) return <AuthLoading />;

  const query = search.trim().toLowerCase();
  const filtered = events
    .filter((e) => {
      if (filter === "all") return true;
      if (filter === "draft") return e.published === false;
      return e.published !== false && getEventStatus(e) === filter;
    })
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

  // A draft event is never "active" or "upcoming", no matter what its date says —
  // published status overrides the purely time-based getEventStatus for stats/
  // filtering purposes, since a draft isn't actually live for anyone to attend.
  const publishedEvents = events.filter((e) => e.published !== false);
  const draftEvents = events.filter((e) => e.published === false);
  const stats = [
    { label: "Total Events", value: events.length },
    { label: "Active", value: publishedEvents.filter((e) => getEventStatus(e) === "active").length },
    { label: "Upcoming", value: publishedEvents.filter((e) => getEventStatus(e) === "upcoming").length },
    { label: "Draft", value: draftEvents.length },
    { label: "Total Leads", value: leads.length },
  ];

  const handleCreate = async (data: EventWizardData, intent: "draft" | "publish") => {
    try {
      const created = await addEvent({ ...data, published: intent === "publish" });
      setShowWizard(false);
      if (intent === "publish") {
        toast.success("Event created");
        notifyEventCreated(created);
      } else {
        toast.success("Saved as draft — publish it from the event page when you're ready");
      }
    } catch (err) {
      throw err instanceof PersistError ? new Error(err.message) : err instanceof Error ? err : new Error("Couldn't create that event. Please try again.");
    }
  };

  /** Best-effort — a failed notification email should never surface to the admin
   *  who just successfully created their event. The route derives recipient/name/
   *  event details from the signed-in session and the event's own row server-side —
   *  this only needs to point at which event. */
  async function notifyEventCreated(event: EventRecord) {
    try {
      await fetch("/api/notify/event-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id }),
      });
    } catch {
      // Silent — this is a nice-to-have confirmation, not a required step.
    }
  }

  return (
    <Shell>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-slate-900">Events</h1>
            <p className="text-slate-500 text-sm mt-0.5">Manage your event schedule</p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#1B512D] hover:bg-[#0e2b18] transition-[transform,background-color] active:scale-[0.97] shrink-0 whitespace-nowrap"
          >
            <Plus size={16} />
            New Event
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {!dataReady
            ? Array.from({ length: 5 }).map((_, i) => <StatTileSkeleton key={i} />)
            : stats.map((s, i) => (
                <Reveal key={s.label} index={i}>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p>
                  </div>
                </Reveal>
              ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(["all", "draft", "active", "upcoming", "completed"] as const).map((f) => (
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
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <button
            onClick={() => setShowFilterModal(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
              activeFilterCount > 0
                ? "border-brand-600/30 bg-brand-600/5 text-brand-600"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filter
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-semibold tabular-nums">
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
          {!dataReady ? (
            Array.from({ length: 6 }).map((_, i) => <EventCardSkeleton key={i} />)
          ) : (
            <>
              {sorted.map((ev, i) => (
                <Reveal key={ev.id} index={i} className="h-full">
                  <EventCard event={ev} />
                </Reveal>
              ))}
              {sorted.length === 0 && (
                <div className="col-span-3 text-center py-16 text-slate-400">
                  <Calendar size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No events found</p>
                </div>
              )}
            </>
          )}
        </div>

        {showWizard && (
          <EventWizard mode="create" onSubmit={handleCreate} onCancel={() => setShowWizard(false)} />
        )}
      </div>
    </Shell>
  );
}
