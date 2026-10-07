"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageUp } from "lucide-react";

type Left = { covers: number; speakers: number; logos: number };

/** Platform → Maintenance: moves images still stored inline in the database
 *  (base64 covers, speaker photos, logos) into file storage, in batches. */
export function MoveImagesCard() {
  const [left, setLeft] = useState<Left | null>(null);
  const [running, setRunning] = useState(false);
  const [movedTotal, setMovedTotal] = useState(0);

  useEffect(() => {
    fetch("/api/platform/move-images")
      .then((r) => (r.ok ? r.json() : null))
      .then(setLeft)
      .catch(() => {});
  }, []);

  const total = left ? left.covers + left.speakers + left.logos : 0;

  async function run() {
    setRunning(true);
    let moved = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/platform/move-images", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Couldn't move images.");
        moved += json.moved;
        setMovedTotal(moved);
        setLeft(json.remaining);
        const rest = json.remaining.covers + json.remaining.speakers + json.remaining.logos;
        // stop when done, or when a batch moved nothing (the rest keep failing)
        if (rest === 0 || json.moved === 0) {
          if (rest > 0) toast.error(`${rest} image${rest === 1 ? "" : "s"} couldn't be moved and stay in the database.`);
          break;
        }
      }
      toast.success(`Moved ${moved} image${moved === 1 ? "" : "s"} to file storage`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move images.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-line p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-fuchsia-500/15">
            <ImageUp size={18} className="text-[#ff8af5]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-fg">Images in the database</p>
            <p className="text-sm text-muted">
              {left == null
                ? "Checking…"
                : total === 0
                  ? "None left: every cover, speaker photo and logo is a file."
                  : `${left.covers} event cover${left.covers === 1 ? "" : "s"}, ${left.speakers} speaker photo${left.speakers === 1 ? "" : "s"} and ${left.logos} logo${left.logos === 1 ? "" : "s"} are stored inside the database. Moving them to file storage keeps the database small and pages faster.`}
              {movedTotal > 0 && ` Moved ${movedTotal} so far.`}
            </p>
          </div>
        </div>
        {total > 0 && (
          <button type="button" onClick={run} disabled={running} className="eb-btn eb-btn--primary">
            {running ? "Moving…" : "Move to file storage"}
          </button>
        )}
      </div>
    </div>
  );
}
