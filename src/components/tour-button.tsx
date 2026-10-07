"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Map as MapIcon, X } from "lucide-react";
import { createTourFromEvent, PersistError, useTours } from "@/lib/store";
import type { EventRecord } from "@/lib/types";

/** Event page header: "Make it a tour" for a one-city event, or a link to the
 *  tour this city already belongs to. */
export function TourButton({ event }: { event: EventRecord }) {
  const tours = useTours();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const tour = event.tourId ? tours.find((t) => t.id === event.tourId) : undefined;
  const btn =
    "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-surface/60 backdrop-blur-md text-sm font-medium text-fg-3 transition-all hover:bg-canvas hover:shadow-sm active:scale-[0.96]";

  if (tour) {
    return (
      <Link href={`/tours/${tour.id}`} className={btn} title="This event is one city of a tour">
        <MapIcon size={14} /> Tour: <span className="max-w-[160px] truncate text-fg">{tour.name}</span>
      </Link>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const t = await createTourFromEvent(event.id, name);
      toast.success("Tour created. Now add your other cities.");
      router.push(`/tours/${t.id}`);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't create the tour. Please try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(event.name);
          setOpen(true);
        }}
        className={btn}
      >
        <MapIcon size={14} /> Make it a tour
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4 animate-modal-backdrop" onClick={() => !saving && setOpen(false)}>
          <form
            onSubmit={create}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl animate-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="tour-title" className="text-lg font-semibold text-fg">
                Run this event in more cities
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-fg">
                <X size={18} />
              </button>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              This event becomes the first city. Each city you add gets its own page, tickets, door staff and payouts, and one tour page lists every date.
            </p>
            <label htmlFor="tour-name" className="eb-label eb-req mt-5">
              Tour name
            </label>
            <input id="tour-name" className="eb-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus />
            <p className="mt-1.5 text-xs text-subtle">Shown on the tour page, e.g. &ldquo;Afrobeats Live: Nigeria Tour 2026&rdquo;.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="eb-btn eb-btn--ghost">
                Cancel
              </button>
              <button type="submit" disabled={saving || !name.trim()} className="eb-btn eb-btn--primary">
                {saving ? "Creating…" : "Create tour"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
