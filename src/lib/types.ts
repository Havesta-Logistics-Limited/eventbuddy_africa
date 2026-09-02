export type Role = "admin" | "staff" | "rep";

/** Owned by exactly one event — not shared across an org's events. Two events that
 *  both need "United Kingdom" each get their own independent Destination row (and
 *  their own Universities under it); editing one never affects the other. See
 *  copyDestinationsFromEvent in store.ts for the "start from another event's list"
 *  shortcut. */
export interface Destination {
  id: string;
  eventId: string;
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
  /** Only meaningful for templates that use destinations (see event-templates.ts). false
   *  = "students only" — reps get no check-in link and no visibility into this event's
   *  leads at all. Defaults true ("students and reps") for every event, including ones
   *  created before this existed. */
  allowRepAccess?: boolean;
  /** Physical events only — false means no public sign-up link exists for this event at
   *  all; staff capture every lead directly at the booth (walk-up, no registration or
   *  QR code involved). Always true for virtual events, where self-service registration
   *  IS the only way attendees get captured — see /api/orgs/[slug]/register. */
  selfRegistrationEnabled?: boolean;
  /** A third, independent attendee-acquisition mode for private/corporate events with
   *  a known guest list — separate from selfRegistrationEnabled, which keeps meaning
   *  exactly what it always meant. When true, there's no public sign-up link at all;
   *  attendees only get in by accepting a personal invite (see event_guests / the
   *  Guests tab / /rsvp). Mutually exclusive with self-service registration in the
   *  wizard's UI, though the two flags are independently stored. */
  isInviteOnly?: boolean;
  /** false = a physical event awaiting Paystack payment — it exists but is inert (no
   *  check-in, no lead capture, not listed for self-service registration) until payment
   *  succeeds. Always true for virtual events and every event created before this
   *  feature existed. Only ever flipped by the Paystack payment routes (or a platform
   *  admin) — see protect_event_payment_fields in the paystack_payments migration. */
  published?: boolean;
  /** The price actually snapshotted on this event at creation time (0 for virtual) —
   *  see events_set_price_naira in the currency_usd_to_naira migration. */
  priceNaira?: number;
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

/** A purchasable option for an event's self-service registration — priceNaira = 0 is a
 *  free ticket (registers instantly, same as before ticketing existed); priceNaira > 0
 *  routes the attendee through a real Paystack split payment before any registration
 *  is created (see /api/orgs/[slug]/ticket-purchase/initialize). */
export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  priceNaira: number;
  /** null = unlimited. */
  quantityAvailable?: number | null;
  quantitySold: number;
  salesStart?: string;
  salesEnd?: string;
  createdAt: string;
}

export type DiscountType = "percentage" | "fixed";
export type PerCustomerLimit = "single" | "unlimited";

/** A promo code scoped to one event. Redemption (usesCount) only increments once a
 *  purchase actually succeeds, mirroring how ticket_types.quantitySold works — all
 *  validation (scope, dates, caps, per-customer limit) lives in one place, the
 *  public_validate_discount_code Postgres function, not duplicated in the client. */
export interface DiscountCode {
  id: string;
  eventId: string;
  code: string;
  discountType: DiscountType;
  /** Percentage (0-100) or a flat Naira amount, depending on discountType. */
  discountValue: number;
  /** null/undefined = applies to every paid ticket type on the event. */
  ticketTypeIds?: string[] | null;
  /** Whether the same buyer (matched by email) can redeem this code more than once. */
  perCustomerLimit: PerCustomerLimit;
  /** null = unlimited redemptions across all customers. */
  maxUses?: number | null;
  usesCount: number;
  /** The ticket's own listed price must be at least this for the code to apply. */
  minSpendNaira?: number | null;
  /** Caps the Naira amount actually discounted — mainly relevant to percentage codes. */
  maxDiscountNaira?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
}

/** One successful redemption of a discount code — who used it, on which ticket
 *  purchase, and what they actually paid after the discount. Read from
 *  paystack_transactions directly (see getDiscountCodeRedemptions), not stored as
 *  its own table — a code's usage history IS just its successful transactions. */
export interface DiscountRedemption {
  fullName: string;
  email: string;
  amountPaidNaira: number;
  purchasedAt: string;
}

export type PlatformDocumentType = "quote" | "invoice";
export type PlatformDocumentStatus = "draft" | "sent" | "accepted" | "declined" | "paid";

export interface PlatformDocumentLineItem {
  description: string;
  quantity: number;
  unitPriceNaira: number;
}

/** A branded quote or invoice a platform admin sends to a prospective or
 *  existing client — entirely internal to eventbuddy's own business, not tied
 *  to any organization on the platform. See platform_documents. */
export interface PlatformDocument {
  id: string;
  docNumber: string;
  docType: PlatformDocumentType;
  status: PlatformDocumentStatus;
  clientName: string;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  lineItems: PlatformDocumentLineItem[];
  notes?: string | null;
  validUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A visitor who typed a plausible email into an event's registration form but
 *  hasn't (yet, as of this read) completed a registration or reached checkout
 *  for it — see registration_form_starts and getEventFormStarts. */
export interface RegistrationFormStart {
  email: string;
  fullName: string | null;
  ticketTypeId: string | null;
  updatedAt: string;
}

/** One paid-ticket checkout attempt for an event, successful or not — read from
 *  paystack_transactions directly, same source as DiscountRedemption. Powers both
 *  the sales-overview totals (status === "success") and the abandoned-checkout
 *  list (status === "pending") on the event's Tickets tab. */
export interface TicketPurchaseAttempt {
  ticketTypeId: string | null;
  discountCodeId: string | null;
  amountNaira: number;
  status: "pending" | "success" | "failed" | "refunded" | "disputed";
  fullName: string;
  email: string;
  createdAt: string;
}

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
  /** Which ticket type this attendee registered under — unset for events with no
   *  ticket types (or registrations created before ticketing existed). */
  ticketTypeId?: string;
  status: RegistrationStatus;
  checkedInAt?: string;
  checkedInBy?: string;
  createdAt: string;
}

export type SessionType = "session" | "keynote" | "panel" | "break" | "networking";
export type SpeakerRole = "speaker" | "moderator" | "panelist" | "keynote";
export type QuestionStatus = "pending" | "approved" | "answered" | "hidden";

/** One item on an event's schedule/itinerary — shown on the attendee-facing Event
 *  Hub and managed from the event's Schedule tab. qaOpen is the organizer's live
 *  on/off switch for whether attendees can currently submit questions targeting
 *  this session — off by default so Q&A doesn't open before a moderator means it to. */
export interface EventSession {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  track?: string;
  sessionType: SessionType;
  qaOpen: boolean;
  speakers: SessionSpeaker[];
  createdAt: string;
}

/** A speaker as assigned to one particular session, with their role on that
 *  session specifically — the same person can be a "keynote" on one session and a
 *  "panelist" on another, so role lives on the assignment, not the speaker. */
export interface SessionSpeaker {
  assignmentId: string;
  speakerId: string;
  name: string;
  photoUrl?: string;
  role: SpeakerRole;
}

/** A member of an event's speaker roster — independent of any one session; see
 *  SessionSpeaker for how a speaker is attached to specific sessions. */
export interface EventSpeaker {
  id: string;
  eventId: string;
  name: string;
  title?: string;
  company?: string;
  bio?: string;
  photoUrl?: string;
  createdAt: string;
}

/** A question submitted by an attendee through the Event Hub — pending until an
 *  organizer moderates it (see QuestionStatus), optionally targeted at a session
 *  and/or a specific speaker on that session's panel. */
export interface EventQuestion {
  id: string;
  eventId: string;
  sessionId?: string;
  speakerId?: string;
  askedByName: string;
  questionText: string;
  status: QuestionStatus;
  upvoteCount: number;
  createdAt: string;
}

/** An organizer-authored broadcast on the Event Hub — one-way, not attendee-
 *  posted, so it carries no moderation status of its own. */
export interface EventAnnouncement {
  id: string;
  eventId: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

export type GuestStatus = "pending" | "accepted" | "declined" | "maybe";

/** A named invite for an invite-only (RSVP) event — see events.isInviteOnly.
 *  registrationId is set the moment a guest accepts: that's the real
 *  registrations/leads row check-in and the Event Hub actually run on, this
 *  is just the invite/response record layered on top of it. */
export interface EventGuest {
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  phone?: string;
  plusOnesAllowed: number;
  plusOnesConfirmed?: number;
  status: GuestStatus;
  registrationId?: string;
  invitedAt?: string;
  respondedAt?: string;
  createdAt: string;
}

export type PollStatus = "draft" | "open" | "closed";

/** A live poll pushed to the room — voteCount on each option is kept in sync by a
 *  database trigger on event_poll_votes (see 0036_event_hub_engagement.sql), never
 *  incremented from application code, so it can't drift from the actual votes. */
export interface EventPoll {
  id: string;
  eventId: string;
  sessionId?: string;
  question: string;
  status: PollStatus;
  options: EventPollOption[];
  createdAt: string;
}

export interface EventPollOption {
  id: string;
  label: string;
  voteCount: number;
}
