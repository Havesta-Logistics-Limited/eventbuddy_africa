"use client";

import { CloudOff } from "lucide-react";
import { StaffRecord } from "@/lib/types";

/** When this device last reached us. Absolute rather than "3 minutes ago" so
 *  the value is a pure function of its input — a clock read during render is
 *  impure, and an organizer reads this against the wall clock anyway. */
function seenLabel(iso?: string): string {
  if (!iso) return "not seen yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "not seen yet";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Tells the organizer which staff devices are still holding leads that have
 * never reached the server.
 *
 * The honest framing matters here: these leads are on a phone, so nothing on
 * this screen can pull them in — a "sync" button here would be theatre. What
 * this can do is name the device to go find, which is the actual action.
 * Renders nothing when every device is clear.
 */
export function OfflineDevicesNotice({ staff }: { staff: StaffRecord[] }) {
  const holding = staff
    .filter((s) => (s.pendingLeadsCount ?? 0) > 0)
    .sort((a, b) => (b.pendingLeadsCount ?? 0) - (a.pendingLeadsCount ?? 0));

  if (holding.length === 0) return null;

  const total = holding.reduce((sum, s) => sum + (s.pendingLeadsCount ?? 0), 0);

  return (
    <div className="rounded-xl border border-amber-500/35/50 bg-amber-500/10 p-4 mb-5">
      <div className="flex items-start gap-3">
        <CloudOff className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#78350F]">
            {total} {total === 1 ? "lead is" : "leads are"} still on{" "}
            {holding.length === 1 ? "a staff device" : `${holding.length} staff devices`}
          </p>
          <p className="text-sm text-[#92400E] mt-0.5">
            These haven&rsquo;t reached the server yet, so they aren&rsquo;t in the counts or the export.
            They sync by themselves once the device has signal.
          </p>
          <ul className="mt-3 space-y-1.5">
            {holding.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-[#78350F] truncate">{s.name}</span>
                <span className="shrink-0 tabular-nums text-[#92400E]">
                  {s.pendingLeadsCount} waiting · last seen {seenLabel(s.lastSyncAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
