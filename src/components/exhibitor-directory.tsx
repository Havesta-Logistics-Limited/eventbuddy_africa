"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ExhibitorTile } from "@/components/exhibitor-tile";
import { FloorPlan } from "@/components/floor-plan";

export type DirectoryExhibitor = {
  id: string;
  company: string;
  logoUrl: string | null;
  category: string | null;
  description: string | null;
  website: string | null;
  standLabel: string | null;
  x: number | null;
  y: number | null;
};

/** The exhibitor directory (0116): search, category filter, and the floor
 *  plan, where tapping a company lights up its stand. */
export function ExhibitorDirectory({ exhibitors, floorPlanUrl }: { exhibitors: DirectoryExhibitor[]; floorPlanUrl: string | null }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const categories = useMemo(() => [...new Set(exhibitors.map((x) => x.category?.trim()).filter((c): c is string => !!c))].sort(), [exhibitors]);
  const pins = exhibitors.filter((x) => x.x != null && x.y != null).map((x) => ({ id: x.id, label: x.standLabel ?? "", x: Number(x.x), y: Number(x.y), title: x.company }));
  const needle = q.trim().toLowerCase();
  const shown = exhibitors.filter(
    (x) =>
      (!cat || x.category?.trim() === cat) &&
      (!needle || [x.company, x.category, x.description, x.standLabel].some((v) => v?.toLowerCase().includes(needle)))
  );

  function select(id: string) {
    setActive((a) => (a === id ? null : id));
    if (floorPlanUrl && pins.some((p) => p.id === id)) planRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-4">
      {floorPlanUrl && pins.length > 0 && (
        <div ref={planRef}>
          <FloorPlan src={floorPlanUrl} pins={pins} activeId={active} onPinClick={select} />
          <p className="mt-1.5 text-center text-xs text-subtle">{active ? `${exhibitors.find((x) => x.id === active)?.company} is lit up on the map.` : "Tap a company or a pin to find its stand."}</p>
        </div>
      )}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input className="eb-input" style={{ paddingLeft: 36 }} placeholder="Search exhibitors" aria-label="Search exhibitors" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {[null, ...categories].map((c) => (
            <button key={c ?? "all"} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className="eb-cat-chip">
              {c ?? "All"}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-subtle">No exhibitors match that.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((x) => (
            <ExhibitorTile
              key={x.id}
              company={x.company}
              logoUrl={x.logoUrl}
              category={x.category}
              description={x.description}
              website={x.website}
              standLabel={x.standLabel}
              active={active === x.id}
              onSelect={() => select(x.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
