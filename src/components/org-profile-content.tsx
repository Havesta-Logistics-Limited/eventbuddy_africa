"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight, LayoutGrid, List, MapPin, Video, BadgeCheck, CalendarX } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";
import { FollowOrgButton } from "@/components/follow-org-button";
import { formatDate, formatTime } from "@/lib/utils";
import { formatNaira } from "@/lib/billing";
import { getEventStatus } from "@/lib/capture-window";

type OrgProfileEvent = {
  id: string;
  slug?: string;
  name: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  location: string;
  venue: string;
  coverImage?: string;
  eventFormat: "physical" | "virtual";
  virtualPlatform?: string;
  selfRegistrationEnabled: boolean;
  minPriceNaira: number | null;
};

type OrgProfile = { name: string; slug: string; bio: string; logoUrl?: string; isVerified: boolean };

/** A booth-only event (no online registration — leads captured at the door)
 *  still gets listed for promotion/awareness, but "Free" would misleadingly
 *  imply there's something to sign up for. */
function priceBadge(event: OrgProfileEvent) {
  if (!event.selfRegistrationEnabled) return { label: "Booth only", cls: "bg-amber-500/10 text-amber-300" };
  if (event.minPriceNaira == null || event.minPriceNaira === 0) return { label: "Free", cls: "bg-fill text-fg-3" };
  return { label: `From ${formatNaira(event.minPriceNaira)}`, cls: "bg-emerald-500/10 text-emerald-300" };
}

function EventCard({ event, orgSlug, i }: { event: OrgProfileEvent; orgSlug: string; i: number }) {
  const badge = priceBadge(event);
  return (
    <Link
      href={event.slug ? `/${event.slug}` : `/${orgSlug}/events/${event.id}/register`}
      className="group rounded-2xl border border-line bg-surface overflow-hidden hover:border-brand-600/40 hover:shadow-md transition-all animate-fade-in-up"
      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
    >
      <div className="aspect-[16/9] bg-fill relative overflow-hidden">
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
        <h2 className="font-semibold text-fg mb-2 line-clamp-2">{event.name}</h2>
        <div className="space-y-1.5 text-sm text-muted">
          <p className="flex items-center gap-1.5 min-w-0">
            <Calendar size={13} className="text-subtle shrink-0" />
            <span className="truncate">
              {formatDate(event.date)}
              {event.startTime && ` · ${formatTime(event.startTime)}`}
            </span>
          </p>
          {event.eventFormat === "virtual" ? (
            <p className="flex items-center gap-1.5 min-w-0">
              <Video size={13} className="text-subtle shrink-0" />
              <span className="truncate">{event.virtualPlatform || "Virtual event"}</span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 min-w-0">
              <MapPin size={13} className="text-subtle shrink-0" />
              <span className="truncate">
                {event.venue}, {event.location}
              </span>
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** A month grid alongside the default list view — same events, arranged by
 *  date instead of upcoming/past, so a visitor can see at a glance which days
 *  this organizer has something on. Each cell links straight to the event,
 *  same destination as an EventCard. */
function CalendarView({ events, orgSlug }: { events: OrgProfileEvent[]; orgSlug: string }) {
  const [month, setMonth] = useState(() => {
    const first = events.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
    const base = first ? new Date(`${first.date}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const eventsByDate = new Map<string, OrgProfileEvent[]>();
  for (const event of events) {
    const start = new Date(`${event.date}T00:00:00`);
    const end = new Date(`${event.endDate ?? event.date}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toDateStr(d);
      const arr = eventsByDate.get(key) ?? [];
      arr.push(event);
      eventsByDate.set(key, arr);
    }
  }

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const today = toDateStr(new Date());

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-fg">{monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg text-subtle hover:bg-canvas hover:text-fg-3"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
            className="p-1.5 rounded-lg text-subtle hover:bg-canvas hover:text-fg-3"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-fill rounded-lg overflow-hidden border border-line-soft">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-canvas text-center text-[11px] font-medium text-subtle py-1.5">
            {label}
          </div>
        ))}
        {cells.map((day) => {
          const key = toDateStr(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const inMonth = day.getMonth() === monthStart.getMonth();
          return (
            <div key={key} className={`bg-surface min-h-[64px] sm:min-h-[92px] p-1 sm:p-1.5 ${inMonth ? "" : "bg-canvas/50"}`}>
              <p className={`text-[11px] mb-1 ${key === today ? "font-bold text-brand-500" : inMonth ? "text-subtle" : "text-faint"}`}>{day.getDate()}</p>
              <div className="space-y-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <Link
                    key={event.id}
                    href={event.slug ? `/${event.slug}` : `/${orgSlug}/events/${event.id}/register`}
                    className="block text-[10px] leading-snug px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 truncate hover:bg-brand-500/15"
                    title={event.name}
                  >
                    {event.name}
                  </Link>
                ))}
                {dayEvents.length > 2 && <p className="text-[10px] text-subtle px-1.5">+{dayEvents.length - 2} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Public /[orgSlug] profile page — an organizer's name, optional bio, and every
 *  publicly reachable event they've run, split into upcoming and past. Client-
 *  rendered like /discover (the sibling page.tsx wrapper handles generateMetadata
 *  server-side for the parts that matter for sharing/SEO). */
export function OrgProfileContent({ orgSlug }: { orgSlug: string }) {
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [events, setEvents] = useState<OrgProfileEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");

  useEffect(() => {
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/public-profile`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setLoadError(json.error);
          return;
        }
        setProfile(json.organization);
        setEvents(json.events || []);
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  // Same status logic the register page and dashboard already use — a plain
  // date comparison alone can't tell "upcoming" from "happening right now"
  // for a multi-day event that's started but not finished yet.
  const eventStatuses = new Map(events.map((e) => [e.id, getEventStatus(e)]));
  const ongoing = events.filter((e) => eventStatuses.get(e.id) === "active").sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((e) => eventStatuses.get(e.id) === "upcoming").sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => eventStatuses.get(e.id) === "completed");

  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      {loading ? (
        <div className="max-w-6xl mx-auto px-6 py-20 text-center text-subtle">Loading…</div>
      ) : loadError || !profile ? (
        <div className="max-w-6xl mx-auto px-6 py-20 text-center text-subtle">
          <p className="font-medium text-muted">{loadError || "This organizer couldn't be found."}</p>
        </div>
      ) : (
        <>
          <section className="max-w-6xl mx-auto px-6 pt-14 pb-8">
            <div className="flex items-center gap-4">
              {profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt={profile.name} className="w-16 h-16 rounded-2xl object-cover shrink-0" />
              ) : (
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center font-display text-2xl shrink-0"
                  style={{ background: "#FF8AF5", color: "#170821" }}
                >
                  {profile.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl text-fg flex items-center gap-2">
                  {profile.name}
                  {profile.isVerified && <BadgeCheck size={22} className="text-brand-500" />}
                </h1>
                {profile.bio && <p className="text-muted mt-1 max-w-xl">{profile.bio}</p>}
              </div>
              <FollowOrgButton orgSlug={orgSlug} theme="light" />
            </div>
          </section>

          <section className="max-w-6xl mx-auto px-6 pb-24">
            <div className="flex justify-end mb-6">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-fill">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    view === "list" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg-2"
                  }`}
                >
                  <List size={13} />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setView("calendar")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    view === "calendar" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg-2"
                  }`}
                >
                  <LayoutGrid size={13} />
                  Calendar
                </button>
              </div>
            </div>
            {events.length === 0 ? (
              <div className="text-center py-20 text-subtle bg-surface rounded-2xl border border-line">
                <CalendarX size={32} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium text-muted">No public events yet</p>
                <p className="text-sm mt-1">Check back soon.</p>
              </div>
            ) : (
              <>
                {view === "calendar" ? (
                  <CalendarView events={events} orgSlug={orgSlug} />
                ) : (
                  <>
                    {ongoing.length > 0 && (
                      <div className="mb-10">
                        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-4">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Happening now
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                          {ongoing.map((event, i) => (
                            <EventCard key={event.id} event={event} orgSlug={orgSlug} i={i} />
                          ))}
                        </div>
                      </div>
                    )}
                    {upcoming.length > 0 && (
                      <div className="mb-10">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-4">Upcoming</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                          {upcoming.map((event, i) => (
                            <EventCard key={event.id} event={event} orgSlug={orgSlug} i={i} />
                          ))}
                        </div>
                      </div>
                    )}
                    {past.length > 0 && (
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-4">Past events</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 opacity-80">
                          {past.map((event, i) => (
                            <EventCard key={event.id} event={event} orgSlug={orgSlug} i={i} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}

      <LandingFooter />
    </div>
  );
}
