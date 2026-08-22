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
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
        <Globe2 size={28} className="mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-500">No destinations set for this event</p>
        <p className="text-xs text-slate-400 mt-1.5">Edit the event to add destinations and their universities.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-slate-100 p-3 flex sm:flex-col gap-1 overflow-x-auto">
          {eventDests.map((d) => {
            const count = universities.filter((u) => u.destinationId === d.id).length;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d.id)}
                className={`text-left px-3 py-2.5 rounded-lg transition-colors shrink-0 border-l-2 ${
                  isActive ? "bg-brand-600/5 border-brand-600" : "border-transparent hover:bg-slate-50"
                }`}
              >
                <p className={`text-sm font-medium flex items-center gap-1.5 whitespace-nowrap ${isActive ? "text-brand-700" : "text-slate-700"}`}>
                  <span className="leading-none">{d.flag}</span>
                  {d.name}
                </p>
                <p className={`text-lg font-bold mt-0.5 ${isActive ? "text-brand-700" : "text-slate-900"}`}>{count}</p>
              </button>
            );
          })}
        </div>

        <div className="flex-1 p-4 space-y-2">
          {activeUnis.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No universities set up for this destination yet.</p>}
          {activeUnis.map((u) => {
            const count = leads.filter((l) => l.universityId === u.id).length;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelectUniversity(u.destinationId, u.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-brand-600/30 hover:bg-brand-600/5 text-left transition-colors"
              >
                <span className="text-sm font-medium text-slate-800">{u.name}</span>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${count > 0 ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-400"}`}
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
