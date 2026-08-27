import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EventRecord, FieldDef } from "./types";
import { getEventStatus } from "./capture-window";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Guards any admin-authored free-text URL (currently: an event's virtual join
 * link) before it's ever used as an `href`. React doesn't sanitize `href`
 * values, so an unvalidated `javascript:`/`data:` URI pasted into a text input
 * would render as a live, clickable link on both the organizer's own dashboard
 * and the public registration confirmation page. Checked again here at render
 * time (not just at the wizard's input) so it also covers any value already
 * stored before this check existed.
 */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

/**
 * Orders events so the ones happening soonest lead: any event in progress
 * right now comes first, then upcoming events nearest their start date,
 * then completed events with the most recently finished on top.
 */
export function sortEventsByProximity<T extends Pick<EventRecord, "date" | "endDate" | "startTime" | "endTime" | "timezone">>(events: T[]): T[] {
  const priority: Record<ReturnType<typeof getEventStatus>, number> = { active: 0, upcoming: 1, completed: 2 };
  return [...events].sort((a, b) => {
    const statusA = getEventStatus(a);
    const statusB = getEventStatus(b);
    if (priority[statusA] !== priority[statusB]) return priority[statusA] - priority[statusB];
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return statusA === "completed" ? timeB - timeA : timeA - timeB;
  });
}

export function newId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

// No 0/O or 1/I — easy to read back off a QR-adjacent printout or read aloud at a desk.
const REFERENCE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short, human-friendly attendee registration code (e.g. "K7QX-4R2M"), shown to the
 *  attendee as text and encoded into their QR code. Not cryptographically unguessable —
 *  it doesn't need to be, since the registrations table's RLS keeps them from being
 *  listed, only looked up one at a time server-side at check-in. */
export function generateReferenceId(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += REFERENCE_ID_ALPHABET[Math.floor(Math.random() * REFERENCE_ID_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "September 2026" style label used for the Event month filter. */
export function getEventMonthLabel(event: Pick<EventRecord, "date">) {
  return new Date(event.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** City portion of "City, Country" used for the Event location filter. */
export function getEventCity(event: Pick<EventRecord, "location">) {
  return event.location.split(",")[0].trim();
}

/** Renders a lead's answers to an event's admin-defined customFields as a single
 *  "Label: value; Label: value" string, for surfaces that don't have a bespoke
 *  per-field layout (CSV export, generic leads tables). */
export function formatCustomAnswers(answers: Record<string, string | string[]> | undefined, fields: FieldDef[] | undefined): string {
  if (!answers || !fields || fields.length === 0) return "";
  return fields
    .filter((f) => {
      const v = answers[f.id];
      return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
    })
    .map((f) => `${f.label}: ${Array.isArray(answers[f.id]) ? (answers[f.id] as string[]).join(", ") : answers[f.id]}`)
    .join("; ");
}

/**
 * Downscales and re-encodes an uploaded image to a small JPEG data URL.
 * A raw phone photo can be several MB as base64 — well past what
 * localStorage can hold across all events combined — so every image goes
 * through this before it's ever stored.
 */
export function compressImageFile(file: File, maxDimension = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Image compression isn't supported in this browser."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
