"use client";

import { Calendar, MapPin, Presentation } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/utils";
import { Logo } from "@/components/logo";

const VARIANTS = {
  staff: {
    gradient: "linear-gradient(145deg, #04223d 0%, #1098F7 100%)",
    eyebrow: "text-sky-300",
  },
  rep: {
    gradient: "linear-gradient(145deg, #0b0500 0%, #1B512D 100%)",
    eyebrow: "text-fuchsia-300",
  },
};

export function EventSignInHero({
  eyebrow,
  event,
  instruction,
  secondaryAction,
  variant = "staff",
}: {
  eyebrow: string;
  event: EventRecord;
  instruction: string;
  secondaryAction?: { label: string; onClick: () => void };
  variant?: "staff" | "rep";
}) {
  const theme = VARIANTS[variant];
  return (
    <div className="relative overflow-hidden px-6 pt-6 pb-16 text-white" style={{ background: theme.gradient }}>
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <Logo tone="white" height={14} />
          {secondaryAction && (
            <button type="button" onClick={secondaryAction.onClick} className="text-sm font-medium text-white/80 hover:text-white transition-colors">
              {secondaryAction.label}
            </button>
          )}
        </div>
        <p className={`mt-8 font-mono text-xs font-semibold uppercase tracking-widest ${theme.eyebrow}`}>{eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl sm:text-3xl leading-tight">{event.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
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
        <p className="mt-3 text-white/60 text-sm max-w-sm">{instruction}</p>
      </div>
    </div>
  );
}
