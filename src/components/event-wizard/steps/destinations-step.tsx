"use client";

import { Destination } from "@/lib/types";

export function DestinationsStep({
  destinations,
  selectedIds,
  onChange,
}: {
  destinations: Destination[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">Destinations</label>
      <p className="text-xs text-slate-500 mb-3">Which countries is this fair covering?</p>
      <div className="grid grid-cols-2 gap-2">
        {destinations.map((d) => {
          const checked = selectedIds.includes(d.id);
          return (
            <label
              key={d.id}
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                checked ? "border-[#610064] bg-[#610064]/5" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selectedIds.filter((x) => x !== d.id) : [...selectedIds, d.id])}
                className="sr-only"
              />
              <span className="text-base">{d.flag}</span>
              <span className="text-sm text-slate-700">{d.name}</span>
            </label>
          );
        })}
        {destinations.length === 0 && <p className="text-sm text-slate-400 col-span-2">No destinations set up yet — add some in Settings first.</p>}
      </div>
    </div>
  );
}
