import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EventRecord, FieldDef, getEventStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Orders events so the ones happening soonest lead: any event in progress
 * right now comes first, then upcoming events nearest their start date,
 * then completed events with the most recently finished on top.
 */
export function sortEventsByProximity<T extends Pick<EventRecord, "date" | "endDate">>(events: T[]): T[] {
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
