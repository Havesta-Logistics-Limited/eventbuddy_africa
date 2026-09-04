"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Video, Search, CalendarX } from "lucide-react";
import { Logo } from "@/components/logo";
import { formatDate, formatTime } from "@/lib/utils";
import { formatNaira } from "@/lib/billing";

type DiscoverEvent = {
  id: string;
  slug?: string;
  name: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location: string;
  venue: string;
  description: string;
  coverImage?: string;
  eventFormat: "physical" | "virtual";
  virtualPlatform?: string;
  orgName: string;
  orgSlug: string;
  minPriceNaira: number | null;
};

function priceBadge(minPriceNaira: number | null) {
  if (minPriceNaira == null) return { label: "Free", cls: "bg-slate-100 text-slate-600" };
  if (minPriceNaira === 0) return { label: "Free", cls: "bg-slate-100 text-slate-600" };
  return { label: `From ${formatNaira(minPriceNaira)}`, cls: "bg-emerald-50 text-emerald-700" };
}

function isFree(minPriceNaira: number | null) {
  return minPriceNaira == null || minPriceNaira === 0;
}

type PriceFilter = "all" | "free" | "paid";
type TypeFilter = "all" | "physical" | "virtual";

const PRICE_FILTERS: { key: PriceFilter; label: string }[] = [
  { key: "all", label: "All events" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "physical", label: "In-person" },
  { key: "virtual", label: "Virtual" },
];

export default function DiscoverEventsPage() {
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [cityFilter, setCityFilter] = useState("all");

  useEffect(() => {
    fetch("/api/events/discover")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setLoadError(json.error);
          return;
        }
        setEvents(json.events || []);
      })
      .catch(() => setLoadError("Couldn't load events. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, []);

  const cities = Array.from(new Set(events.map((e) => e.location).filter(Boolean))).sort();

  const filtered = events.filter((e) => {
    if (priceFilter === "free" && !isFree(e.minPriceNaira)) return false;
    if (priceFilter === "paid" && isFree(e.minPriceNaira)) return false;
    if (typeFilter !== "all" && e.eventFormat !== typeFilter) return false;
    if (cityFilter !== "all" && e.location !== cityFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || e.orgName.toLowerCase().includes(q) || e.location.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="sm:hidden">
            <Logo height={18} />
          </span>
          <span className="hidden sm:block">
            <Logo height={26} />
          </span>
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link href="/discover" className="text-sm font-medium text-brand-600 hidden sm:block">
              Events
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
              Pricing
            </Link>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link href="/signup" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-14 pb-8 text-center">
        <h1 className="font-display text-4xl sm:text-5xl text-slate-900 mb-3">Find an event to attend</h1>
        <p className="text-slate-500 max-w-xl mx-auto">Every live event running on eventbuddy — register or grab a ticket in a couple of taps.</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="relative max-w-md mx-auto mb-5">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event, organizer, or city…"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {PRICE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setPriceFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                priceFilter === f.key
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="w-px h-5 bg-slate-200 mx-1" />
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                typeFilter === f.key
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
          {cities.length > 1 && (
            <>
              <span className="w-px h-5 bg-slate-200 mx-1" />
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 ${
                  cityFilter === "all" ? "border-slate-200 text-slate-600" : "border-brand-600 text-brand-700"
                }`}
              >
                <option value="all">All locations</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-pulse">
                <div className="aspect-[16/9] bg-slate-100" />
                <div className="p-5 space-y-2.5">
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="text-center py-20 text-slate-400">
            <p>{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <CalendarX size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium text-slate-500">{events.length === 0 ? "No live events right now" : "No events match your filters"}</p>
            <p className="text-sm mt-1">
              {events.length === 0 ? "Check back soon — new events are added all the time." : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map((event, i) => {
              const badge = priceBadge(event.minPriceNaira);
              return (
                <Link
                  key={event.id}
                  href={event.slug ? `/discover/${event.slug}` : `/${event.orgSlug}/events/${event.id}/register`}
                  className="group rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-brand-600/40 hover:shadow-md transition-all animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="aspect-[16/9] bg-slate-100 relative overflow-hidden">
                    {event.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={event.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: "radial-gradient(ellipse 150% 130% at 80% -10%, #FF8AF5 0%, #C21FAF 60%, #170821 140%)" }}
                      >
                        <span className="font-display text-2xl text-white/90 px-6 text-center">{event.name}</span>
                      </div>
                    )}
                    <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium text-brand-600 uppercase tracking-wide mb-1.5">{event.orgName}</p>
                    <h2 className="font-semibold text-slate-900 mb-2 line-clamp-2">{event.name}</h2>
                    <div className="space-y-1.5 text-sm text-slate-500">
                      <p className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400 shrink-0" />
                        {formatDate(event.date)}
                        {event.startTime && ` · ${formatTime(event.startTime)}`}
                      </p>
                      {event.eventFormat === "virtual" ? (
                        <p className="flex items-center gap-1.5">
                          <Video size={13} className="text-slate-400 shrink-0" />
                          {event.virtualPlatform || "Virtual event"}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 truncate">
                          <MapPin size={13} className="text-slate-400 shrink-0" />
                          {event.venue}, {event.location}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="text-white" style={{ background: "#170821" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <Logo tone="white" variant="full" height={16} />
            <p className="text-sm text-white/50 mt-4 max-w-xs leading-relaxed">
              Registration, ticketing, and check-in for any event — education fairs, job fairs, conferences, and more.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Product</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/discover" className="text-white/70 hover:text-white">
                Discover Events
              </Link>
              <Link href="/pricing" className="text-white/70 hover:text-white">
                Pricing
              </Link>
              <Link href="/signup" className="text-white/70 hover:text-white">
                Get Started
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Legal</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/privacy" className="text-white/70 hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-white/70 hover:text-white">
                Terms &amp; Conditions
              </Link>
              <Link href="/contact" className="text-white/70 hover:text-white">
                Contact
              </Link>
            </div>
          </div>
        </div>
        <div className="h-1 w-full flex">
          <div className="flex-1" style={{ background: "#C21FAF" }} />
          <div className="flex-1" style={{ background: "#6D28D9" }} />
          <div className="flex-1" style={{ background: "#E85D0A" }} />
          <div className="flex-1" style={{ background: "#B8119C" }} />
        </div>
      </footer>
    </div>
  );
}
