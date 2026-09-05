"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Video, BadgeCheck, CalendarX } from "lucide-react";
import { Logo } from "@/components/logo";
import { FollowOrgButton } from "@/components/follow-org-button";
import { formatDate, formatTime } from "@/lib/utils";
import { formatNaira } from "@/lib/billing";

type OrgProfileEvent = {
  id: string;
  slug?: string;
  name: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location: string;
  venue: string;
  coverImage?: string;
  eventFormat: "physical" | "virtual";
  virtualPlatform?: string;
  minPriceNaira: number | null;
};

type OrgProfile = { name: string; slug: string; bio: string; isVerified: boolean };

function priceBadge(minPriceNaira: number | null) {
  if (minPriceNaira == null || minPriceNaira === 0) return { label: "Free", cls: "bg-slate-100 text-slate-600" };
  return { label: `From ${formatNaira(minPriceNaira)}`, cls: "bg-emerald-50 text-emerald-700" };
}

function EventCard({ event, orgSlug, i }: { event: OrgProfileEvent; orgSlug: string; i: number }) {
  const badge = priceBadge(event.minPriceNaira);
  return (
    <Link
      href={event.slug ? `/discover/${event.slug}` : `/${orgSlug}/events/${event.id}/register`}
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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.endDate ?? e.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => (e.endDate ?? e.date) < today);

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
            <Link href="/discover" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
              Discover Events
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

      {loading ? (
        <div className="max-w-6xl mx-auto px-6 py-20 text-center text-slate-400">Loading…</div>
      ) : loadError || !profile ? (
        <div className="max-w-6xl mx-auto px-6 py-20 text-center text-slate-400">
          <p className="font-medium text-slate-500">{loadError || "This organizer couldn't be found."}</p>
        </div>
      ) : (
        <>
          <section className="max-w-6xl mx-auto px-6 pt-14 pb-8">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center font-display text-2xl shrink-0"
                style={{ background: "#FF8AF5", color: "#170821" }}
              >
                {profile.name.trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl text-slate-900 flex items-center gap-2">
                  {profile.name}
                  {profile.isVerified && <BadgeCheck size={22} className="text-brand-600" />}
                </h1>
                {profile.bio && <p className="text-slate-500 mt-1 max-w-xl">{profile.bio}</p>}
              </div>
              <FollowOrgButton orgSlug={orgSlug} theme="light" />
            </div>
          </section>

          <section className="max-w-6xl mx-auto px-6 pb-24">
            {events.length === 0 ? (
              <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
                <CalendarX size={32} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium text-slate-500">No public events yet</p>
                <p className="text-sm mt-1">Check back soon.</p>
              </div>
            ) : (
              <>
                {upcoming.length > 0 && (
                  <div className="mb-10">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">Upcoming</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      {upcoming.map((event, i) => (
                        <EventCard key={event.id} event={event} orgSlug={orgSlug} i={i} />
                      ))}
                    </div>
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">Past events</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 opacity-80">
                      {past.map((event, i) => (
                        <EventCard key={event.id} event={event} orgSlug={orgSlug} i={i} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

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
