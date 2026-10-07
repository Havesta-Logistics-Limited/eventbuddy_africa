"use client";

/** A floor plan image with numbered stand pins (0116). Pins are stored as
 *  fractions of the image, so they stay in place at any size. */
export type PlanPin = { id: string; label: string; x: number; y: number; title: string };

export function FloorPlan({
  src,
  pins,
  activeId,
  onPick,
  onPinClick,
}: {
  src: string;
  pins: PlanPin[];
  activeId?: string | null;
  /** organizer placement mode: the spot tapped, as fractions of the image */
  onPick?: (x: number, y: number) => void;
  onPinClick?: (id: string) => void;
}) {
  return (
    <div className="eb-floorplan" data-picking={onPick ? "" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Floor plan"
        className="block h-auto w-full select-none"
        draggable={false}
        onClick={(e) => {
          if (!onPick) return;
          const r = e.currentTarget.getBoundingClientRect();
          onPick(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
        }}
      />
      {pins.map((p) => (
        <button
          key={p.id}
          type="button"
          className="eb-floorplan-pin"
          data-active={activeId === p.id || undefined}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          title={p.title}
          aria-label={`${p.title}${p.label ? `, stand ${p.label}` : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onPinClick?.(p.id);
          }}
        >
          {p.label || "•"}
        </button>
      ))}
    </div>
  );
}
