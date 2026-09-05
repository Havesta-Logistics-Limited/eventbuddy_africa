"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { EventSlugEditor } from "@/components/event-slug-editor";

/** Per-event check-in links — the ?event= param locks staff-setup/rep-login to this
 *  one event and skips the "which event are you at?" picker, so a link shared for one
 *  fair can never be used to check in against a different one. Uses the event's own
 *  slug when it has one (same short, readable form the registration link already
 *  uses) instead of always falling back to the raw id — editable right here via
 *  EventSlugEditor, the same control the registration card uses one section up,
 *  since both links share this one field. Shown on the event detail page, scoped
 *  to whether that event's template uses reps. */
export function CheckinLinksCard({
  orgSlug,
  event,
  showStaffLink = true,
  showRepLink = true,
}: {
  orgSlug: string;
  event: EventRecord;
  showStaffLink?: boolean;
  showRepLink?: boolean;
}) {
  const [copied, setCopied] = useState<"staff" | "rep" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const eventParam = event.slug || event.id;
  const links = [
    ...(showStaffLink ? [{ key: "staff" as const, label: "Staff check-in link", path: `/${orgSlug}/staff-setup?event=${eventParam}` }] : []),
    ...(showRepLink ? [{ key: "rep" as const, label: "Rep check-in link", path: `/${orgSlug}/rep-login?event=${eventParam}` }] : []),
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
        {who} this to check in, no admin login needed — unique to this event, it can&apos;t be used to check in against a different one.
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        {links.map(({ key, label, path }) => (
          <button
            key={key}
            type="button"
            onClick={() => copy(key, `${origin}${path}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Link2 size={12} />
            {copied === key ? "Link copied!" : `Copy ${label}`}
          </button>
        ))}
      </div>
      <EventSlugEditor event={event} />
    </div>
  );
}
