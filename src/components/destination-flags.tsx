"use client";

import { Globe2 } from "lucide-react";
import { Destination } from "@/lib/types";
import { isoCodeForCountryName } from "@/lib/country-flags";

/**
 * Flag + short code per destination (e.g. "🇬🇧 UK"), matching the reference
 * institutions-browser style, instead of a bare row of flag emoji. Always
 * stays on one line — once destinations stop fitting, the rest collapse
 * into a "+N" instead of wrapping to a second row.
 */
export function DestinationFlags({ destinations, max = 4 }: { destinations: Destination[]; max?: number }) {
  const shown = destinations.slice(0, max);
  const overflow = destinations.length - shown.length;

  if (destinations.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-hidden min-w-0">
      <Globe2 size={13} className="text-slate-400 shrink-0" />
      {shown.map((d) => (
        <span key={d.id} title={d.name} className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
          <span className="text-sm leading-none">{d.flag}</span>
          {isoCodeForCountryName(d.name) ?? d.name}
        </span>
      ))}
      {overflow > 0 && <span className="shrink-0 text-xs text-slate-400">+{overflow}</span>}
    </div>
  );
}
