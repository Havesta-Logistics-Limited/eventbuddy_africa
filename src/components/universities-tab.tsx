"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";
import { Destination, LeadRecord, University } from "@/lib/types";

/** Grouped-by-destination view of this event's participating universities — a country
 *  rail on the left, that country's universities on the right, each showing how many
 *  leads it has picked up so far (the closest thing we have to the reference's
 *  per-institution referral status, which our schema doesn't track). */
export function UniversitiesTab({
  eventDests,
  universities,
  leads,
  onSelectUniversity,
}: {
  eventDests: Destination[];
  universities: University[];
  leads: LeadRecord[];
  onSelectUniversity: (destinationId: string, universityId: string) => void;
}) {
  const [selected, setSelected] = useState(eventDests[0]?.id ?? "");
  const active = selected || eventDests[0]?.id || "";
  const activeUnis = universities.filter((u) => u.destinationId === active);

  if (eventDests.length === 0) {
    return (
      <div className="bg-canvas border border-line rounded-xl p-10 text-center">
        <Globe2 size={28} className="mx-auto mb-3 text-faint" />
        <p className="font-medium text-muted">No destinations set for this event</p>
        <p className="text-xs text-subtle mt-1.5">Edit the event to add destinations and their universities.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-line-soft p-3 flex sm:flex-col gap-1 overflow-x-auto">
          {eventDests.map((d) => {
            const count = universities.filter((u) => u.destinationId === d.id).length;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d.id)}
                className={`text-left px-3 py-2.5 rounded-lg transition-colors shrink-0 border-l-2 ${
                  isActive ? "bg-brand-600/5 border-brand-600" : "border-transparent hover:bg-canvas"
                }`}
              >
                <p className={`text-sm font-medium flex items-center gap-1.5 whitespace-nowrap ${isActive ? "text-brand-500" : "text-fg-2"}`}>
                  <span className="leading-none">{d.flag}</span>
                  {d.name}
                </p>
                <p className={`text-lg font-bold mt-0.5 ${isActive ? "text-brand-500" : "text-fg"}`}>{count}</p>
              </button>
            );
          })}
        </div>

        <div className="flex-1 p-4 space-y-2">
          {activeUnis.length === 0 && <p className="text-sm text-subtle py-6 text-center">No universities set up for this destination yet.</p>}
          {activeUnis.map((u) => {
            const count = leads.filter((l) => l.universityId === u.id).length;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelectUniversity(u.destinationId, u.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-line hover:border-brand-600/30 hover:bg-brand-600/5 text-left transition-colors"
              >
                <span className="text-sm font-medium text-fg">{u.name}</span>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${count > 0 ? "bg-brand-500/10 text-brand-500" : "bg-fill text-subtle"}`}
                >
                  {count} lead{count !== 1 ? "s" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
