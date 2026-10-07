"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { formatNaira } from "@/lib/billing";

/** Public event page: "Exhibit at this event" when the organizer is taking
 *  exhibitor applications (migration 0112). Renders nothing otherwise. */
export function ExhibitCta({ eventId }: { eventId: string }) {
  const [info, setInfo] = useState<{ slug: string; from: number | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/exhibit/info?eventId=${encodeURIComponent(eventId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live || !d.enabled || d.closed || !d.event?.slug) return;
        const prices = (d.stands as { priceNaira: number; left: number | null }[]).filter((s) => s.left !== 0).map((s) => s.priceNaira);
        if (prices.length) setInfo({ slug: d.event.slug, from: Math.min(...prices) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [eventId]);
  if (!info) return null;
  return (
    <Link href={`/${info.slug}/exhibit`} className="eb-exhibit-cta">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(255_138_245/0.12)] text-[#ff8af5]">
        <Store size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-white">Exhibit at this event</span>
        <span className="block text-sm text-white/60">Book a stand for your business{info.from ? `, from ${formatNaira(info.from)}` : ""}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-white/50" aria-hidden="true" />
    </Link>
  );
}
