"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

/** Per-event check-in links — the ?event= param locks staff-setup/rep-login to this
 *  one event and skips the "which event are you at?" picker, so a link shared for one
 *  fair can never be used to check in against a different one. Shown on the event
 *  detail page, scoped to whether that event's template uses reps. */
export function CheckinLinksCard({
  orgSlug,
  eventId,
  showStaffLink = true,
  showRepLink = true,
}: {
  orgSlug: string;
  eventId: string;
  showStaffLink?: boolean;
  showRepLink?: boolean;
}) {
  const [copied, setCopied] = useState<"staff" | "rep" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links = [
    ...(showStaffLink ? [{ key: "staff" as const, label: "Staff check-in link", path: `/${orgSlug}/staff-setup?event=${eventId}` }] : []),
    ...(showRepLink ? [{ key: "rep" as const, label: "Rep check-in link", path: `/${orgSlug}/rep-login?event=${eventId}` }] : []),
  ];

  function copy(key: "staff" | "rep", url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(key);
      toast.success("Link copied");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const who = showStaffLink && showRepLink ? "Staff and reps use" : showRepLink ? "Reps use" : "Staff uses";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Check-in link{links.length !== 1 ? "s" : ""}</h2>
      <p className="text-xs text-slate-500 mb-3">
        Share {links.length !== 1 ? "these" : "this"} with your team — {who} this to check in, no admin login needed. Unique to this event — it can&apos;t be used
        to check in against a different one.
      </p>
      <div className="space-y-2">
        {links.map(({ key, label, path }) => {
          const url = `${origin}${path}`;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 truncate">
                <span className="text-slate-400">{label}:</span> {url}
              </div>
              <button
                type="button"
                onClick={() => copy(key, url)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 shrink-0"
              >
                {copied === key ? <Check size={13} className="text-teal-600" /> : <Copy size={13} />}
                {copied === key ? "Copied" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
