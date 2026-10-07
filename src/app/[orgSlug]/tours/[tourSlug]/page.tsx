import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { createAnonClient } from "@/lib/supabase/anon";
import { PublicHeader } from "@/components/register-page-content";
import { LandingFooter } from "@/components/landing/landing-close";
import { canonicalEventPath } from "@/lib/event-og-image";
import { getEventStatus } from "@/lib/capture-window";
import { formatNaira } from "@/lib/billing";
import { formatTime } from "@/lib/utils";

type Params = { orgSlug: string; tourSlug: string };
type City = {
  event_id: string;
  slug: string | null;
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  timezone: string | null;
  location: string;
  venue: string;
  cover_image: string | null;
  event_format: string | null;
  min_price: number | null;
  has_tickets: boolean;
  sold_out: boolean;
};
type TourRow = { tour_id: string; tour_name: string; tour_description: string | null; org_name: string; org_slug: string; cities: City[] };

async function loadTour(orgSlug: string, tourSlug: string) {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_tour", { p_org_slug: orgSlug, p_tour_slug: tourSlug }).maybeSingle<TourRow>();
  return data ?? null;
}

function cityLabel(c: City) {
  return c.event_format === "virtual" ? "Online" : c.location || c.name;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, tourSlug } = await params;
  const tour = await loadTour(orgSlug, tourSlug);
  if (!tour) return {};
  const where = tour.cities.map(cityLabel).join(" · ");
  const description = tour.tour_description || `${tour.cities.length} ${tour.cities.length === 1 ? "city" : "cities"}: ${where}. By ${tour.org_name}.`;
  return {
    title: tour.tour_name,
    description,
    alternates: { canonical: `/${orgSlug}/tours/${tourSlug}` },
    openGraph: { title: tour.tour_name, description, images: tour.cities.find((c) => c.cover_image?.startsWith("http"))?.cover_image ?? undefined },
  };
}

/** The public tour page: every city's date with a ticket button per city. */
export default async function TourPublicPage({ params }: { params: Promise<Params> }) {
  const { orgSlug, tourSlug } = await params;
  const tour = await loadTour(orgSlug, tourSlug);

  if (!tour) {
    return (
      <div className="min-h-screen bg-canvas">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32 text-center">
          <div className="max-w-sm text-white/60">
            <p className="font-medium text-white">This tour couldn&apos;t be found.</p>
            <p className="mt-1 text-sm">Check the link you were given and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const cover = tour.cities.find((c) => c.cover_image)?.cover_image;
  const now = new Date();
  const cities = tour.cities.map((c) => {
    const status = getEventStatus({ date: c.date, endDate: c.end_date ?? undefined, startTime: c.start_time ?? undefined, endTime: undefined, timezone: c.timezone ?? undefined }, now);
    return { ...c, ended: status === "completed" };
  });
  const upcoming = cities.filter((c) => !c.ended).length;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <PublicHeader />
      <main>
        <section className="eb-page-hero mx-auto max-w-4xl px-4 pb-10 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff8af5]">
            Tour · {cities.length} {cities.length === 1 ? "city" : "cities"}
          </p>
          <h1 className="mt-3 font-display text-white">{tour.tour_name}</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            {tour.tour_description || <>By {tour.org_name}. Pick your city and get your ticket.</>}
          </p>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="mx-auto mt-8 aspect-[16/7] w-full max-w-3xl rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
          )}
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6" aria-labelledby="dates">
          <h2 id="dates" className="mb-4 text-sm font-semibold uppercase tracking-wider text-subtle">
            {upcoming > 0 ? "Dates" : "This tour has ended"}
          </h2>
          {cities.length === 0 ? (
            <p className="eb-ov-card text-center text-sm text-muted">Dates are coming soon.</p>
          ) : (
            <ul className="space-y-3">
              {cities.map((c) => {
                const d = new Date(`${c.date}T00:00:00`);
                const href = canonicalEventPath(tour.org_slug, { id: c.event_id, slug: c.slug ?? undefined } as Parameters<typeof canonicalEventPath>[1]);
                const free = !c.has_tickets || (c.min_price ?? 0) === 0;
                const cta = c.ended ? "Ended" : c.sold_out ? "Sold out" : free ? "Register" : "Buy Ticket";
                return (
                  <li key={c.event_id} className="eb-tour-row flex-wrap sm:flex-nowrap" data-off={c.ended || c.sold_out || undefined}>
                    <div className="eb-tour-date" aria-hidden="true">
                      <span>{d.toLocaleDateString("en-GB", { month: "short" })}</span>
                      <strong>{d.getDate()}</strong>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold text-white">{cityLabel(c)}</p>
                      <p className="flex items-start gap-1.5 text-sm text-muted">
                        <MapPin size={13} className="mt-[3px] shrink-0" aria-hidden="true" />
                        <span>
                          {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                          {c.start_time ? ` · ${formatTime(c.start_time)}` : ""}
                          {c.venue ? ` · ${c.venue}` : ""}
                        </span>
                      </p>
                      {!c.ended && !c.sold_out && <p className="mt-1 text-sm text-fg-3 sm:hidden">{free ? "Free" : `From ${formatNaira(Number(c.min_price))}`}</p>}
                    </div>
                    <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
                      {!c.ended && !c.sold_out && <span className="hidden text-sm text-fg-3 sm:inline">{free ? "Free" : `From ${formatNaira(Number(c.min_price))}`}</span>}
                      {c.ended || c.sold_out ? (
                        <span className="eb-tour-status" data-status={c.ended ? "Ended" : "Sold out"}>
                          {cta}
                        </span>
                      ) : (
                        <Link href={href} className="eb-btn eb-btn--primary flex-1 justify-center sm:flex-none" aria-label={`${cta} for ${cityLabel(c)} on ${c.date}`}>
                          {cta}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-8 text-center text-sm text-subtle">
            Presented by{" "}
            <Link href={`/${tour.org_slug}`} className="text-fg-3 underline-offset-4 hover:underline">
              {tour.org_name}
            </Link>
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
