"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { checkinLinkPath } from "@/lib/utils";
import { EventSlugEditor } from "@/components/event-slug-editor";

/** Per-event check-in links — the trailing path segment locks staff-setup/rep-login
 *  to this one event and skips the "which event are you at?" picker, so a link
 *  shared for one fair can never be used to check in against a different one. Uses
 *  the event's own staffCheckinSlug/repCheckinSlug when set (as a short root-level
 *  link, same trick as the registration link — see checkinLinkPath), independent
 *  of the registration link's `slug` and of each other — each editable right here
 *  via its own EventSlugEditor, so customizing one link never touches another.
 *  Shown on the event detail page, scoped to whether that event's template uses reps. */
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
  const links = [
    ...(showStaffLink ? [{ key: "staff" as const, label: "Staff check-in link", path: checkinLinkPath("staff", event, orgSlug) }] : []),
    ...(showRepLink ? [{ key: "rep" as const, label: "Rep check-in link", path: checkinLinkPath("rep", event, orgSlug) }] : []),
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
      <div className="space-y-1.5">
        {showStaffLink && <EventSlugEditor event={event} field="staffCheckinSlug" label={showRepLink ? "staff" : undefined} />}
        {showRepLink && <EventSlugEditor event={event} field="repCheckinSlug" label={showStaffLink ? "rep" : undefined} />}
      </div>
    </div>
  );
}
