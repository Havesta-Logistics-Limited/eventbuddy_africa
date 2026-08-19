export type Role = "admin" | "staff" | "rep";

export interface Destination {
  id: string;
  name: string;
  flag: string;
}

export interface University {
  id: string;
  destinationId: string;
  name: string;
  shortName: string;
}

export type EventStatus = "upcoming" | "active" | "completed";

export type FieldType =
  | "short_text"
  | "paragraph"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "dropdown"
  | "multiple_choice"
  | "checkboxes";

/** A single admin-defined question on a non-Education-Fair event's lead-capture form.
 *  `id` is a stable slug used as the customAnswers key — never the label, so relabeling
 *  a question later doesn't orphan previously-collected answers. */
export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** dropdown / multiple_choice / checkboxes only. */
  options?: string[];
}

export interface EventRecord {
  id: string;
  name: string;
  date: string; // ISO date, start
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location: string; // "City, Country"
  venue: string;
  destinationIds: string[];
  description: string;
  coverImage?: string;
  /** Staff must enter this at check-in on /staff-setup for this event. Unset = no gate. */
  staffAccessCode?: string;
  /** University reps must enter this at check-in on /rep-login for this event. Unset = no gate. */
  repAccessCode?: string;
  /** Which event-templates.ts template this event was created from. Optional here even
   *  though the DB column is NOT NULL DEFAULT 'education-fair' — the DB default covers
   *  any call site that doesn't set it. */
  templateId?: string;
  /** Admin-defined lead-form questions for non-Education-Fair templates. */
  customFields?: FieldDef[];
  /** IANA zone (e.g. "Africa/Lagos"), captured automatically from the creating admin's
   *  browser when the event is made. Unset for events created before this existed —
   *  capture-window.ts falls back to naive runtime-local comparison in that case. */
  timezone?: string;
  /** Admin override of the automatic date/time-based lead-capture gate. null/undefined
   *  = automatic (the default, based on the event's own dates/times). */
  captureOverride?: "open" | "closed" | null;
  createdAt: string;
}

/** Live status derived from dates — more accurate than a stored field that
 *  never transitions on its own. */
export function getEventStatus(event: Pick<EventRecord, "date" | "endDate">, now = new Date()): EventStatus {
  const start = new Date(event.date);
  const end = new Date(event.endDate || event.date);
  end.setHours(23, 59, 59, 999);
  if (now > end) return "completed";
  if (now >= start) return "active";
  return "upcoming";
}

/** Staff and rep check-in records (device-local session, no password — see
 *  loginAsStaff/loginAsRep). The signed-in admin is a real Supabase Auth user
 *  identified via organizations.owner_user_id, not a row in this table; the
 *  admin session below is bridged into this same shape for a stable useSession(). */
export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  destinationId?: string;
  universityId?: string;
  eventId?: string;
  /** Reps only — prevents two people signing in as the same rep at once. */
  isOnline?: boolean;
  /** Admin only — the org's slug, e.g. for building /[orgSlug]/staff-setup links to share. */
  orgSlug?: string;
}

export type LevelOfInterest = "BSc" | "MSc" | "PhD";
export type HighestEducation = "Undergraduate" | "BSc" | "MSc" | "PhD";
export type IeltsStatus = "No" | "Yes" | "Registered";

export interface LeadRecord {
  id: string;
  eventId: string;
  /** Unset for events whose template doesn't use destinations/universities
   *  (anything other than Education Fair). */
  destinationId?: string;
  universityId?: string;
  staffId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  preferredCourse: string;
  levelOfInterest: LevelOfInterest | "";
  startYear: string;
  highestEducation: HighestEducation | "";
  takenIELTS: IeltsStatus | "";
  comments: string;
  /** Answers to the event's admin-defined customFields, keyed by FieldDef.id. */
  customAnswers?: Record<string, string | string[]>;
  createdAt: string;
}

/** The signed-in user on this device/browser. Mirrors StaffRecord plus the
 *  event/destination/university a staff or rep session is locked to. */
export type Session = StaffRecord;
