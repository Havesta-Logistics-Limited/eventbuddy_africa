"use client";

import { useEffect, useState } from "react";

type Item = { id: string; company: string; logoUrl: string | null };
const SHOW = 12;

/** Public event page: "Who's exhibiting", the confirmed exhibitors' logos
 *  (0116). Renders nothing until there's at least one. */
export function ExhibitorStrip({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`/api/exhibit/directory?eventId=${encodeURIComponent(eventId)}`)
      .then((r) => r.json())
      .then((d) => live && setItems(d.exhibitors ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [eventId]);
  if (!items.length) return null;
  return (
    <div className="bg-surface/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6">
      <h2 className="font-semibold text-white mb-3">Who&apos;s exhibiting</h2>
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {items.slice(0, SHOW).map((x) => (
          <li key={x.id} className="flex flex-col items-center gap-1.5 text-center" title={x.company}>
            <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-white">
              {x.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.logoUrl} alt={x.company} className="h-full w-full object-contain p-2" />
              ) : (
                <span className="text-xl font-bold text-[#1a0b1f]">{x.company.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <span className="w-full truncate text-xs text-white/70">{x.company}</span>
          </li>
        ))}
      </ul>
      {items.length > SHOW && <p className="mt-3 text-xs text-white/50">and {items.length - SHOW} more. See them all in your Event Hub.</p>}
    </div>
  );
}
