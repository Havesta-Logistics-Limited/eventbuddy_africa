"use client";

import { Calendar, MapPin, Presentation } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/utils";
import { Logo } from "@/components/logo";

/** Sits directly on the shared DarkAuroraShell backdrop (see dark-aurora-shell.tsx)
 *  rather than its own solid color banner — same look as the registration page's
 *  own title block, so a staff/rep check-in link feels like the same product as
 *  the registration link an attendee gets. */
export function EventSignInHero({
  eyebrow,
  event,
  instruction,
  secondaryAction,
}: {
  eyebrow: string;
  event: EventRecord;
  instruction: string;
  secondaryAction?: { label: string; onClick: () => void };
  /** colour comes from the surrounding DarkAuroraShell tone */
  variant?: "staff" | "rep";
}) {
  return (
    <div className="relative pt-6 pb-16 text-white">
      <div className="flex items-center justify-between">
        <span className="hidden sm:block">
          <Logo tone="white" height={26} />
        </span>
        <span className="sm:hidden">
          <Logo tone="white" height={18} />
        </span>
        {secondaryAction && (
          <button type="button" onClick={secondaryAction.onClick} className="text-sm font-medium text-white/80 hover:text-white transition-colors">
            {secondaryAction.label}
          </button>
        )}
      </div>
      <p className="eb-portal-eyebrow mt-10">{eyebrow}</p>
      <h1 className="mt-3 font-display text-3xl sm:text-4xl leading-tight" style={{ textWrap: "balance" }}>
        {event.name}
      </h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
        <span className="inline-flex items-center gap-1.5">
          {event.eventFormat === "virtual" ? (
            <>
              <Presentation size={13} /> {event.virtualPlatform || "Online"} (Virtual)
            </>
          ) : (
            <>
              <MapPin size={13} /> {event.venue}, {event.location}
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={13} />
          {formatDate(event.date)}
          {event.startTime && `, ${formatTime(event.startTime)}`}
          {event.endTime && ` - ${formatTime(event.endTime)}`}
        </span>
      </p>
      <p className="mt-3 text-white/70 text-[15px] leading-relaxed max-w-md">{instruction}</p>
    </div>
  );
}
