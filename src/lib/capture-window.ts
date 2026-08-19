import { EventRecord, EventStatus } from "./types";

/**
 * Converts a civil date+time to the real UTC instant it represents in `timezone`, via the
 * standard Intl-based double-conversion trick (no date library needed): format a guess
 * instant in the target zone, measure the drift against the civil time we wanted, and
 * correct for it. One pass is enough for this app's purposes (lead-capture windows, not
 * scheduling across a DST transition to the second).
 *
 * When `timezone` is unset (events created before this feature existed), falls back to
 * naive parsing — interpreted in whatever runtime evaluates it, matching this app's
 * previous behavior everywhere.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timezone?: string): Date {
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const iso = `${dateStr}T${time}`;
  if (!timezone) return new Date(iso);

  const guess = new Date(`${iso}Z`);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(guess)) if (p.type !== "literal") parts[p.type] = p.value;
  if (parts.hour === "24") parts.hour = "00"; // some environments format midnight as "24"

  const guessInZone = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  const driftMs = guess.getTime() - guessInZone.getTime();
  return new Date(guess.getTime() + driftMs);
}

export interface CaptureWindow {
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}

/** The window that gates lead capture for an event — just the event's own fields. */
export function windowFromEvent(event: Pick<EventRecord, "date" | "endDate" | "startTime" | "endTime">): CaptureWindow {
  return { date: event.date, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime };
}

export type CaptureGateReason = "not_started" | "ended" | "manually_closed";

export interface CaptureGate {
  open: boolean;
  reason?: CaptureGateReason;
  opensAt: Date;
  closesAt: Date;
}

/** `override` lets an admin force an event's lead-capture open or closed regardless of
 *  its scheduled dates/times — e.g. running long, or cut short. `opensAt`/`closesAt` are
 *  still the scheduled window either way, so the UI can show it alongside an override. */
export function getCaptureGate(
  window: CaptureWindow,
  timezone: string | undefined,
  override?: "open" | "closed" | null,
  now = new Date()
): CaptureGate {
  const opensAt = zonedTimeToUtc(window.date, window.startTime || "00:00", timezone);
  const closesAt = zonedTimeToUtc(window.endDate || window.date, window.endTime || "23:59:59", timezone);
  if (override === "open") return { open: true, opensAt, closesAt };
  if (override === "closed") return { open: false, reason: "manually_closed", opensAt, closesAt };
  if (now < opensAt) return { open: false, reason: "not_started", opensAt, closesAt };
  if (now > closesAt) return { open: false, reason: "ended", opensAt, closesAt };
  return { open: true, opensAt, closesAt };
}

/** Live status derived from the event's actual start/end date+time (in its own
 *  timezone) — the same window getCaptureGate uses, so a dashboard "Active" badge
 *  always agrees with whether lead capture/registration/check-in is actually open.
 *  Deliberately ignores captureOverride: that's an admin's manual open/closed toggle
 *  for capture, not a claim about whether the event itself is chronologically over. */
export function getEventStatus(
  event: Pick<EventRecord, "date" | "endDate" | "startTime" | "endTime" | "timezone">,
  now = new Date()
): EventStatus {
  const opensAt = zonedTimeToUtc(event.date, event.startTime || "00:00", event.timezone);
  const closesAt = zonedTimeToUtc(event.endDate || event.date, event.endTime || "23:59:59", event.timezone);
  if (now > closesAt) return "completed";
  if (now >= opensAt) return "active";
  return "upcoming";
}

/** Attendee registration should be open in advance of the event, not just during it —
 *  the opposite shape from lead capture (which only makes sense once staff are on-site).
 *  Same window/override, but no "not_started" state: registration is open from anytime
 *  up until the event ends, unless the admin has manually closed it. */
export function getRegistrationGate(
  window: CaptureWindow,
  timezone: string | undefined,
  override?: "open" | "closed" | null,
  now = new Date()
): CaptureGate {
  const opensAt = zonedTimeToUtc(window.date, window.startTime || "00:00", timezone);
  const closesAt = zonedTimeToUtc(window.endDate || window.date, window.endTime || "23:59:59", timezone);
  if (override === "open") return { open: true, opensAt, closesAt };
  if (override === "closed") return { open: false, reason: "manually_closed", opensAt, closesAt };
  if (now > closesAt) return { open: false, reason: "ended", opensAt, closesAt };
  return { open: true, opensAt, closesAt };
}
