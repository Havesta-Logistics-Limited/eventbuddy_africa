"use client";

import { useState } from "react";
import { Calendar, Clock, MapPin, Search, SlidersHorizontal, Presentation } from "lucide-react";
import { Destination, EventRecord, EventStatus } from "@/lib/types";
import { getEventStatus } from "@/lib/capture-window";
import { formatDate, formatTime, getEventCity, getEventMonthLabel, sortEventsByProximity } from "@/lib/utils";
import { DestinationFlags } from "@/components/destination-flags";
import { EventFilterModal } from "@/components/event-filter-modal";
import { Reveal } from "@/components/reveal";
import { Logo } from "@/components/logo";

const statusStyles: Record<EventStatus, string> = {
  active: "bg-teal-100 text-teal-700",
  upcoming: "bg-amber-100 text-amber-700",
  completed: "bg-slate-100 text-slate-500",
};

const VARIANTS = {
  staff: {
    gradient: "linear-gradient(145deg, #04223d 0%, #1098F7 100%)",
    eyebrow: "text-sky-300",
    focusRing: "focus:ring-[#1098F7]",
    cardHoverBorder: "hover:border-[#1098F7]",
    ctaHover: "group-hover:border-[#1098F7] group-hover:text-[#1098F7] group-hover:bg-[#1098F7]/5",
    accent: "blue" as const,
  },
  rep: {
    gradient: "linear-gradient(145deg, #0b0500 0%, #1B512D 100%)",
    eyebrow: "text-fuchsia-300",
    focusRing: "focus:ring-[#1B512D]",
    cardHoverBorder: "hover:border-[#1B512D]",
    ctaHover: "group-hover:border-[#1B512D] group-hover:text-[#1B512D] group-hover:bg-[#1B512D]/5",
    accent: "purple" as const,
  },
};

function EventCover({ event, flag, gradient }: { event: EventRecord; flag: string; gradient: string }) {
  if (event.coverImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" />
    );
  }
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: gradient }}>
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <span className="absolute -bottom-4 -right-2 text-7xl leading-none opacity-90" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.25))" }}>
        {flag}
      </span>
    </div>
  );
}

export function EventPicker({
  eyebrow,
  title,
  subtitle,
  events,
  destinations,
  onSelect,
  secondaryAction,
  selectLabel = "Select event",
  variant = "staff",
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  events: EventRecord[];
  destinations: Destination[];
  onSelect: (id: string) => void;
  secondaryAction: { label: string; onClick: () => void };
  selectLabel?: string;
  variant?: "staff" | "rep";
}) {
  const theme = VARIANTS[variant];
  const [search, setSearch] = useState("");
  const [destFilter, setDestFilter] = useState<string[]>([]);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const query = search.trim().toLowerCase();
  const filteredEvents = events
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
  const sortedEvents = sortEventsByProximity(filteredEvents);

  const availableMonths = Array.from(new Set(events.map((e) => getEventMonthLabel(e)))).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const availableLocations = Array.from(new Set(events.map((e) => getEventCity(e)))).sort();
  const activeFilterCount = destFilter.length + monthFilter.length + locationFilter.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden px-6 pt-6 pb-16 text-white" style={{ background: theme.gradient }}>
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <Logo tone="white" height={14} />
            <button type="button" onClick={secondaryAction.onClick} className="text-sm font-medium text-white/80 hover:text-white transition-colors">
              {secondaryAction.label}
            </button>
          </div>
          <p className={`mt-8 font-mono text-xs font-semibold uppercase tracking-widest ${theme.eyebrow}`}>{eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl leading-tight">{title}</h1>
          <p className="mt-2 text-white/60 text-sm max-w-sm">{subtitle}</p>
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 -mt-8 pb-10">
        {events.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
            No active events found.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events, venue, city..."
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 ${theme.focusRing}`}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowFilterModal(true)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium shadow-sm transition-colors ${
                  activeFilterCount > 0
                    ? variant === "rep"
                      ? "border-[#1B512D]/30 bg-[#1B512D]/5 text-[#1B512D]"
                      : "border-[#1098F7]/30 bg-[#1098F7]/5 text-[#1098F7]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <SlidersHorizontal size={14} />
                Filter
                {activeFilterCount > 0 && (
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-semibold"
                    style={{ background: variant === "rep" ? "#1B512D" : "#1098F7" }}
                  >
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
              resultCount={sortedEvents.length}
              accent={theme.accent}
            />

            {sortedEvents.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
                No events match your search.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {sortedEvents.map((evt, i) => {
                  const status = getEventStatus(evt);
                  const eventDests = destinations.filter((d) => evt.destinationIds.includes(d.id));
                  const primaryFlag = eventDests[0]?.flag ?? "🌍";
                  return (
                    <Reveal key={evt.id} index={i} className="h-full">
                    <button
                      onClick={() => onSelect(evt.id)}
                      className={`group flex h-full flex-col text-left bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all ${theme.cardHoverBorder}`}
                    >
                      <div className="relative h-36 bg-slate-100 shrink-0">
                        <EventCover event={evt} flag={primaryFlag} gradient={theme.gradient} />
                        <div className="absolute top-3 left-3">
                          <span className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm ${statusStyles[status]}`}>
                            {status}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="font-display text-lg text-slate-900 leading-snug line-clamp-2">{evt.name}</h3>
                        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                          <Calendar size={13} className="shrink-0" />
                          {formatDate(evt.date)}
                        </p>
                        {(evt.startTime || evt.endTime) && (
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                            <Clock size={13} className="shrink-0" />
                            {evt.startTime && formatTime(evt.startTime)}
                            {evt.endTime && ` - ${formatTime(evt.endTime)}`}
                          </p>
                        )}
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 truncate">
                          {evt.eventFormat === "virtual" ? (
                            <>
                              <Presentation size={13} className="shrink-0" />
                              <span className="truncate">{evt.virtualPlatform || "Online"} (Virtual)</span>
                            </>
                          ) : (
                            <>
                              <MapPin size={13} className="shrink-0" />
                              <span className="truncate">{evt.location}</span>
                            </>
                          )}
                        </p>
                        {eventDests.length > 0 && (
                          <div className="mt-2.5">
                            <DestinationFlags destinations={eventDests} />
                          </div>
                        )}

                        <div className="mt-auto pt-4">
                          <span className={`block w-full text-center py-2 rounded-full border border-slate-300 text-sm font-medium text-slate-700 transition-colors ${theme.ctaHover}`}>
                            {selectLabel}
                          </span>
                        </div>
                      </div>
                    </button>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
