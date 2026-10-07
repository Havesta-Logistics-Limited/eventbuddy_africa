"use client";

import { useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/copy-text";
import Link from "next/link";
import { toast } from "sonner";
import { Calendar, Check, Copy, Lock, MapPin, Megaphone, Search } from "lucide-react";
import { Shell } from "@/components/shell";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";
import { formatNaira } from "@/lib/billing";
import { PersistError, getMarketplace, getMyPromoterStats, getPromoterDashboard, useSession, type MarketplaceEvent } from "@/lib/store";
import { meetsVerified, type PromoterBadge } from "@/lib/promoters";
import { formatDate } from "@/lib/utils";

/** The promoter marketplace (migration 0105): upcoming events whose organizers
 *  pay promoters, highest commission first. Public, so it can be shared; a
 *  signed-in promoter sees it inside their app and can join with one tap. */
export default function MarketplacePage() {
  const session = useSession();
  const isPromoter = session?.role === "promoter";
  const content = <MarketplaceContent isPromoter={isPromoter} />;
  if (isPromoter) return <Shell>{content}</Shell>;
  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />
      {content}
      <LandingFooter />
    </div>
  );
}

function MarketplaceContent({ isPromoter }: { isPromoter: boolean }) {
  const [events, setEvents] = useState<MarketplaceEvent[] | null>(null);
  const [joined, setJoined] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [badge, setBadge] = useState<PromoterBadge | null>(null);

  useEffect(() => {
    getMarketplace()
      .then(setEvents)
      .catch((err) => {
        toast.error(err instanceof PersistError ? err.message : "Couldn't load the marketplace.");
        setEvents([]);
      });
  }, []);

  useEffect(() => {
    if (!isPromoter) return;
    // events this promoter already promotes show their link instead of a button
    getPromoterDashboard()
      .then((rows) => setJoined(Object.fromEntries(rows.filter((r) => r.active).map((r) => [r.eventId, ""]))))
      .catch(() => {});
    getMyPromoterStats()
      .then((s) => setBadge(s.badge))
      .catch(() => {});
  }, [isPromoter]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !events) return events;
    return events.filter((e) => [e.name, e.orgName, e.location, e.venue].some((v) => v?.toLowerCase().includes(q)));
  }, [events, query]);

  async function join(e: MarketplaceEvent) {
    setBusy(e.eventId);
    try {
      const res = await fetch("/api/promoters/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: e.eventId }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't join this event.");
      setJoined((j) => ({ ...j, [e.eventId]: json.link }));
      toast.success(
        json.tourLink && json.tourCities > 1
          ? `You're promoting ${e.name} in all ${json.tourCities} cities of the tour. Your links are on your dashboard.`
          : `You're promoting ${e.name}. Your link is ready.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't join this event.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={isPromoter ? "eb-app-page p-6 sm:p-8 max-w-6xl mx-auto" : "mx-auto max-w-6xl px-5 pb-20 pt-28 sm:px-8"}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={isPromoter ? "eb-app-title" : "font-display text-4xl text-fg sm:text-5xl"}>Promoter marketplace</h1>
          <p className={isPromoter ? "eb-app-sub" : "mt-3 max-w-xl text-[16px] leading-relaxed text-fg-3"}>
            Events that pay you to spread the word. Share your own link and earn a share of every ticket it sells.
          </p>
        </div>
        {!isPromoter && (
          <Link href="/promote" className="eb-btn eb-btn--primary">
            <Megaphone size={16} aria-hidden="true" /> Become a promoter
          </Link>
        )}
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events, organizers or cities" aria-label="Search events" className="eb-input" style={{ paddingLeft: "2.5rem" }} />
      </div>

      {shown === null ? (
        <p className="text-sm text-muted">Loading events…</p>
      ) : shown.length === 0 ? (
        <div className="eb-card items-center p-10 text-center">
          <Megaphone size={28} className="mb-3 text-faint" aria-hidden="true" />
          <p className="font-medium text-fg-2">{events?.length ? "No events match that search" : "No events are looking for promoters right now"}</p>
          <p className="mt-1.5 text-sm text-muted">Check back soon. New events join the marketplace all the time.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => {
            const link = joined[e.eventId];
            const isJoined = e.eventId in joined;
            return (
              <article key={e.eventId} className="eb-market-card">
                {/* The rate sits on the seam between poster and details, right-aligned,
                    so it never covers the poster's own artwork or text. */}
                <div className="eb-market-top">
                  <div className="eb-market-cover">
                    {e.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.coverImage} alt="" />
                    ) : (
                      <span className="eb-market-cover-ph">{e.name}</span>
                    )}
                  </div>
                  <span className="eb-market-rate">
                    <span className="eb-market-rate-pct">Earn {e.commissionPct}%</span>
                    <small>{e.commissionCapNaira != null ? `max ${formatNaira(e.commissionCapNaira)}/ticket` : "per ticket sold"}</small>
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4 pt-5">
                  <h2 className="pr-32 font-semibold leading-snug text-fg">{e.name}</h2>
                  <p className="text-xs text-muted">by {e.orgName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-3">
                    <Calendar size={12} aria-hidden="true" /> {formatDate(e.date)}
                  </p>
                  {(e.venue || e.location) && (
                    <p className="flex items-center gap-1.5 truncate text-xs text-fg-3">
                      <MapPin size={12} aria-hidden="true" /> {[e.venue, e.location].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {e.minPriceNaira != null && <p className="text-xs text-subtle">Tickets from {formatNaira(e.minPriceNaira)}</p>}
                  <div className="mt-auto pt-3">
                    {e.access === "invite" ? (
                      <p className="flex items-center justify-center gap-1.5 rounded-lg bg-fill py-2.5 text-xs font-medium text-muted">
                        <Lock size={12} aria-hidden="true" /> Invite only
                      </p>
                    ) : e.access === "verified" && !(e.eventId in joined) && !(isPromoter && meetsVerified(badge)) ? (
                      // verified-only: Seller badge or higher (migration 0106)
                      <p className="flex items-center justify-center gap-1.5 rounded-lg bg-fill py-2.5 text-xs font-medium text-muted">
                        <Lock size={12} aria-hidden="true" /> Seller badge or higher
                      </p>
                    ) : !isPromoter ? (
                      <Link href="/promote" className="eb-btn eb-btn--ghost w-full">
                        Sign up to promote
                      </Link>
                    ) : isJoined ? (
                      link ? (
                        <button
                          type="button"
                          className="eb-btn eb-btn--ghost w-full"
                          onClick={() => {
                            copyText(link)
                              .then(() => {
                                setCopied(e.eventId);
                                setTimeout(() => setCopied(null), 1600);
                              })
                              .catch(() => toast.error("Couldn't copy. Press and hold to copy it instead."));
                          }}
                        >
                          {copied === e.eventId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied === e.eventId ? "Copied" : "Copy your link"}
                        </button>
                      ) : (
                        <Link href="/promoter" className="eb-btn eb-btn--ghost w-full">
                          <Check size={14} aria-hidden="true" /> Promoting · see your link
                        </Link>
                      )
                    ) : (
                      <button type="button" disabled={busy === e.eventId} onClick={() => join(e)} className="eb-btn eb-btn--primary w-full">
                        {busy === e.eventId ? "Joining…" : "Promote this event"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
