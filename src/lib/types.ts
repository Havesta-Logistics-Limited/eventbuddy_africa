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

export type EventFormat = "physical" | "virtual";

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
  /** Physical (a venue/location) or virtual (a join link) event. Defaults to 'physical'
   *  for every event created before this existed. */
  eventFormat?: EventFormat;
  /** Virtual events only — where attendees actually join (Zoom/Meet/Teams/YouTube Live/etc).
   *  EventPal doesn't host video itself, it just stores and shares this link. */
  virtualJoinUrl?: string;
  /** Virtual events only — free-text label for the platform, e.g. "Zoom". */
  virtualPlatform?: string;
  /** Virtual events only — extra info attendees need beyond the link, e.g. a meeting ID/passcode. */
  virtualAccessNotes?: string;
  createdAt: string;
}

// getEventStatus moved to ./capture-window — it needs the same timezone-aware
// start/end-time math as getCaptureGate, so both stay in sync (a status badge saying
// "Active" should always agree with lead capture/registration/check-in actually being open).

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
  /** Set when this lead was pulled from a self-service registration (via /collect's
   *  "Scan to pull attendee details" panel) rather than typed in from scratch — used to
   *  block re-collecting the same attendee's data twice for the same university. */
  registrationId?: string;
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

export type RegistrationStatus = "registered" | "checked_in" | "cancelled";

/** A self-service attendee sign-up via an event's public registration link — distinct
 *  from LeadRecord, which is always captured by a logged-in staff member on-site. Each
 *  registration gets a unique referenceId (shown to the attendee as text + a QR code)
 *  that staff scan or type in at /checkin to mark them attended. */
export interface RegistrationRecord {
  id: string;
  eventId: string;
  referenceId: string;
  fullName: string;
  email: string;
  phone?: string;
  /** Answers to the event's admin-defined customFields, keyed by FieldDef.id — same
   *  convention as LeadRecord.customAnswers. */
  customAnswers?: Record<string, string | string[]>;
  status: RegistrationStatus;
  checkedInAt?: string;
  checkedInBy?: string;
  createdAt: string;
}
