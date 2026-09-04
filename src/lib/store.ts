"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  Destination,
  DiscountCode,
  DiscountRedemption,
  EventAnnouncement,
  EventGuest,
  EventPoll,
  EventQuestion,
  EventRecord,
  EventOneOnOneRequest,
  EventSession,
  EventSpeaker,
  FieldDef,
  LeadRecord,
  PollStatus,
  RegistrationRecord,
  Session,
  SessionSpeaker,
  RegistrationFormStart,
  StaffRecord,
  TicketPurchaseAttempt,
  TicketType,
  University,
} from "./types";
import { createClient as createSupabaseBrowserClient } from "./supabase/client";
import { newId } from "./utils";

const SESSION_KEY = "eventpal:session:v1";

type Listener = () => void;
const listeners = new Set<Listener>();
function emitChange() {
  for (const l of listeners) l();
}
function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isBrowser() {
  return typeof window !== "undefined";
}

function supabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && url.startsWith("http");
}

let destinationsCache: Destination[] = [];
let universitiesCache: University[] = [];
let eventsCache: EventRecord[] = [];
let staffCache: StaffRecord[] = [];
let leadsCache: LeadRecord[] = [];
let registrationsCache: RegistrationRecord[] = [];
let ticketTypesCache: TicketType[] = [];
let discountCodesCache: DiscountCode[] = [];
let eventSessionsCache: EventSession[] = [];
let eventSpeakersCache: EventSpeaker[] = [];
let eventOneOnOneRequestsCache: EventOneOnOneRequest[] = [];
let eventAnnouncementsCache: EventAnnouncement[] = [];
let eventGuestsCache: EventGuest[] = [];
let sessionCache: Session | null = null;
let sessionHydrated = false;

/** Thrown when a Supabase read/write fails — the caller decides how to surface it.
 *  Prefers the actual Postgres/PostgREST error text (e.g. a constraint violation or
 *  RLS rejection) over the generic fallback, so a failed save is diagnosable from the
 *  UI instead of always showing the same unhelpful message regardless of cause. */
export class PersistError extends Error {
  constructor(cause: unknown) {
    const detail =
      cause && typeof cause === "object" && "message" in cause && typeof (cause as { message: unknown }).message === "string"
        ? (cause as { message: string }).message
        : undefined;
    super(detail || "Couldn't save your changes. Please try again.");
    this.cause = cause;
  }
}

function hydrateSession() {
  if (sessionHydrated || !isBrowser()) return;
  sessionHydrated = true;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    sessionCache = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    sessionCache = null;
  }
}

function persistSession() {
  if (isBrowser()) {
    if (sessionCache) window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessionCache));
    else window.localStorage.removeItem(SESSION_KEY);
  }
  // Any session change invalidates the org-scoped cache — different user, different org.
  orgDataFetched = false;
  myOrgId = null;
  emitChange();
}

// ---- row <-> app-type mapping (Postgres snake_case <-> camelCase) ----

function mapDestinationRow(d: { id: string; event_id: string; name: string; flag: string }): Destination {
  return { id: d.id, eventId: d.event_id, name: d.name, flag: d.flag };
}
function mapUniversityRow(u: { id: string; destination_id: string; name: string; short_name: string }): University {
  return { id: u.id, destinationId: u.destination_id, name: u.name, shortName: u.short_name };
}
function mapEventRow(e: {
  id: string;
  slug: string | null;
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  venue: string;
  destination_ids: string[] | null;
  description: string | null;
  cover_image: string | null;
  staff_access_code: string | null;
  rep_access_code: string | null;
  allow_rep_access: boolean | null;
  self_registration_enabled: boolean | null;
  is_invite_only: boolean | null;
  published: boolean | null;
  price_naira: number | null;
  template_id: string | null;
  category: string | null;
  custom_fields: FieldDef[] | null;
  timezone: string | null;
  capture_override: "open" | "closed" | null;
  event_format: string | null;
  virtual_join_url: string | null;
  virtual_platform: string | null;
  virtual_access_notes: string | null;
  registration_page_views: number | null;
  one_on_one_enabled: boolean | null;
  one_on_one_limit: number | null;
  requires_approval: boolean | null;
  waitlist_enabled: boolean | null;
  series_id: string | null;
  series_occurrence_index: number | null;
  survey_enabled: boolean | null;
  survey_fields: FieldDef[] | null;
  created_at: string;
}): EventRecord {
  return {
    id: e.id,
    slug: e.slug ?? undefined,
    name: e.name,
    date: e.date,
    endDate: e.end_date ?? undefined,
    startTime: e.start_time ?? undefined,
    endTime: e.end_time ?? undefined,
    location: e.location,
    venue: e.venue,
    destinationIds: e.destination_ids ?? [],
    description: e.description ?? "",
    coverImage: e.cover_image ?? undefined,
    staffAccessCode: e.staff_access_code ?? undefined,
    repAccessCode: e.rep_access_code ?? undefined,
    allowRepAccess: e.allow_rep_access ?? true,
    selfRegistrationEnabled: e.self_registration_enabled ?? true,
    isInviteOnly: e.is_invite_only ?? false,
    published: e.published ?? true,
    priceNaira: e.price_naira !== null && e.price_naira !== undefined ? Number(e.price_naira) : undefined,
    templateId: e.template_id ?? "education-fair",
    category: e.category ?? undefined,
    customFields: e.custom_fields ?? [],
    timezone: e.timezone ?? undefined,
    captureOverride: e.capture_override ?? null,
    eventFormat: (e.event_format as EventRecord["eventFormat"]) ?? "physical",
    virtualJoinUrl: e.virtual_join_url ?? undefined,
    virtualPlatform: e.virtual_platform ?? undefined,
    virtualAccessNotes: e.virtual_access_notes ?? undefined,
    registrationPageViews: e.registration_page_views ?? 0,
    oneOnOneEnabled: e.one_on_one_enabled ?? false,
    oneOnOneLimit: e.one_on_one_limit ?? undefined,
    requiresApproval: e.requires_approval ?? false,
    waitlistEnabled: e.waitlist_enabled ?? false,
    seriesId: e.series_id ?? undefined,
    seriesOccurrenceIndex: e.series_occurrence_index ?? undefined,
    surveyEnabled: e.survey_enabled ?? false,
    surveyFields: e.survey_fields ?? [],
    createdAt: e.created_at,
  };
}
function eventToRow(input: Partial<Omit<EventRecord, "id" | "createdAt">>) {
  const row: Record<string, unknown> = {};
  if (input.slug !== undefined) row.slug = input.slug || null;
  if (input.name !== undefined) row.name = input.name;
  if (input.date !== undefined) row.date = input.date;
  if (input.endDate !== undefined) row.end_date = input.endDate || null;
  if (input.startTime !== undefined) row.start_time = input.startTime || null;
  if (input.endTime !== undefined) row.end_time = input.endTime || null;
  if (input.location !== undefined) row.location = input.location;
  if (input.venue !== undefined) row.venue = input.venue;
  if (input.destinationIds !== undefined) row.destination_ids = input.destinationIds;
  if (input.description !== undefined) row.description = input.description;
  if (input.coverImage !== undefined) row.cover_image = input.coverImage || null;
  if (input.staffAccessCode !== undefined) row.staff_access_code = input.staffAccessCode || null;
  if (input.repAccessCode !== undefined) row.rep_access_code = input.repAccessCode || null;
  if (input.allowRepAccess !== undefined) row.allow_rep_access = input.allowRepAccess;
  if (input.selfRegistrationEnabled !== undefined) row.self_registration_enabled = input.selfRegistrationEnabled;
  if (input.isInviteOnly !== undefined) row.is_invite_only = input.isInviteOnly;
  if (input.published !== undefined) row.published = input.published;
  if (input.templateId !== undefined) row.template_id = input.templateId;
  if (input.category !== undefined) row.category = input.category || null;
  if (input.customFields !== undefined) row.custom_fields = input.customFields;
  if (input.timezone !== undefined) row.timezone = input.timezone;
  if (input.captureOverride !== undefined) row.capture_override = input.captureOverride;
  if (input.eventFormat !== undefined) row.event_format = input.eventFormat;
  if (input.virtualJoinUrl !== undefined) row.virtual_join_url = input.virtualJoinUrl || null;
  if (input.virtualPlatform !== undefined) row.virtual_platform = input.virtualPlatform || null;
  if (input.virtualAccessNotes !== undefined) row.virtual_access_notes = input.virtualAccessNotes || null;
  if (input.oneOnOneEnabled !== undefined) row.one_on_one_enabled = input.oneOnOneEnabled;
  if (input.oneOnOneLimit !== undefined) row.one_on_one_limit = input.oneOnOneLimit ?? null;
  if (input.requiresApproval !== undefined) row.requires_approval = input.requiresApproval;
  if (input.waitlistEnabled !== undefined) row.waitlist_enabled = input.waitlistEnabled;
  if (input.seriesId !== undefined) row.series_id = input.seriesId ?? null;
  if (input.seriesOccurrenceIndex !== undefined) row.series_occurrence_index = input.seriesOccurrenceIndex ?? null;
  if (input.surveyEnabled !== undefined) row.survey_enabled = input.surveyEnabled;
  if (input.surveyFields !== undefined) row.survey_fields = input.surveyFields;
  return row;
}
function mapStaffRow(s: {
  id: string;
  name: string;
  email: string | null;
  role: string;
  destination_id: string | null;
  university_id: string | null;
  event_id: string | null;
  is_online: boolean;
}): StaffRecord {
  return {
    id: s.id,
    name: s.name,
    email: s.email ?? "",
    role: s.role as StaffRecord["role"],
    destinationId: s.destination_id ?? undefined,
    universityId: s.university_id ?? undefined,
    eventId: s.event_id ?? undefined,
    isOnline: s.is_online,
  };
}
function mapLeadRow(l: {
  id: string;
  event_id: string;
  destination_id: string | null;
  university_id: string | null;
  staff_id: string | null;
  registration_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  preferred_course: string;
  level_of_interest: string;
  start_year: string;
  highest_education: string;
  taken_ielts: string;
  comments: string;
  custom_answers: Record<string, string | string[]> | null;
  status?: string | null;
  hide_from_guest_list?: boolean | null;
  created_at: string;
}): LeadRecord {
  return {
    id: l.id,
    eventId: l.event_id,
    destinationId: l.destination_id ?? undefined,
    universityId: l.university_id ?? undefined,
    staffId: l.staff_id ?? "",
    registrationId: l.registration_id ?? undefined,
    firstName: l.first_name,
    middleName: l.middle_name ?? undefined,
    lastName: l.last_name,
    email: l.email,
    phone: l.phone,
    preferredCourse: l.preferred_course,
    levelOfInterest: l.level_of_interest as LeadRecord["levelOfInterest"],
    startYear: l.start_year,
    highestEducation: l.highest_education as LeadRecord["highestEducation"],
    takenIELTS: l.taken_ielts as LeadRecord["takenIELTS"],
    comments: l.comments,
    customAnswers: l.custom_answers ?? {},
    status: (l.status as LeadRecord["status"]) ?? "registered",
    hideFromGuestList: l.hide_from_guest_list ?? false,
    createdAt: l.created_at,
  };
}
function mapRegistrationRow(r: {
  id: string;
  event_id: string;
  reference_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  custom_answers: Record<string, string | string[]> | null;
  status: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  ticket_type_id: string | null;
  hide_from_guest_list?: boolean | null;
  created_at: string;
}): RegistrationRecord {
  return {
    id: r.id,
    eventId: r.event_id,
    referenceId: r.reference_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone ?? undefined,
    customAnswers: r.custom_answers ?? {},
    status: r.status as RegistrationRecord["status"],
    checkedInAt: r.checked_in_at ?? undefined,
    checkedInBy: r.checked_in_by ?? undefined,
    ticketTypeId: r.ticket_type_id ?? undefined,
    hideFromGuestList: r.hide_from_guest_list ?? false,
    createdAt: r.created_at,
  };
}
function mapTicketTypeRow(t: {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_naira: number;
  quantity_available: number | null;
  quantity_sold: number;
  sales_start: string | null;
  sales_end: string | null;
  created_at: string;
}): TicketType {
  return {
    id: t.id,
    eventId: t.event_id,
    name: t.name,
    description: t.description ?? undefined,
    priceNaira: Number(t.price_naira),
    quantityAvailable: t.quantity_available,
    quantitySold: t.quantity_sold,
    salesStart: t.sales_start ?? undefined,
    salesEnd: t.sales_end ?? undefined,
    createdAt: t.created_at,
  };
}
function ticketTypeToRow(input: Partial<Omit<TicketType, "id" | "createdAt" | "quantitySold">>) {
  const row: Record<string, unknown> = {};
  if (input.eventId !== undefined) row.event_id = input.eventId;
  if (input.name !== undefined) row.name = input.name;
  if (input.description !== undefined) row.description = input.description || null;
  if (input.priceNaira !== undefined) row.price_naira = input.priceNaira;
  if (input.quantityAvailable !== undefined) row.quantity_available = input.quantityAvailable;
  if (input.salesStart !== undefined) row.sales_start = input.salesStart || null;
  if (input.salesEnd !== undefined) row.sales_end = input.salesEnd || null;
  return row;
}
function mapDiscountCodeRow(d: {
  id: string;
  event_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  ticket_type_ids: string[] | null;
  per_customer_limit: string;
  max_uses: number | null;
  uses_count: number;
  min_spend_naira: number | null;
  max_discount_naira: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}): DiscountCode {
  return {
    id: d.id,
    eventId: d.event_id,
    code: d.code,
    discountType: d.discount_type as DiscountCode["discountType"],
    discountValue: Number(d.discount_value),
    ticketTypeIds: d.ticket_type_ids,
    perCustomerLimit: d.per_customer_limit as DiscountCode["perCustomerLimit"],
    maxUses: d.max_uses,
    usesCount: d.uses_count,
    minSpendNaira: d.min_spend_naira != null ? Number(d.min_spend_naira) : null,
    maxDiscountNaira: d.max_discount_naira != null ? Number(d.max_discount_naira) : null,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    createdAt: d.created_at,
  };
}
function discountCodeToRow(input: Partial<Omit<DiscountCode, "id" | "createdAt" | "usesCount">>) {
  const row: Record<string, unknown> = {};
  if (input.eventId !== undefined) row.event_id = input.eventId;
  if (input.code !== undefined) row.code = input.code;
  if (input.discountType !== undefined) row.discount_type = input.discountType;
  if (input.discountValue !== undefined) row.discount_value = input.discountValue;
  if (input.ticketTypeIds !== undefined) row.ticket_type_ids = input.ticketTypeIds && input.ticketTypeIds.length > 0 ? input.ticketTypeIds : null;
  if (input.perCustomerLimit !== undefined) row.per_customer_limit = input.perCustomerLimit;
  if (input.maxUses !== undefined) row.max_uses = input.maxUses;
  if (input.minSpendNaira !== undefined) row.min_spend_naira = input.minSpendNaira;
  if (input.maxDiscountNaira !== undefined) row.max_discount_naira = input.maxDiscountNaira;
  if (input.startsAt !== undefined) row.starts_at = input.startsAt || null;
  if (input.endsAt !== undefined) row.ends_at = input.endsAt || null;
  return row;
}

function mapEventSessionRow(
  s: {
    id: string;
    event_id: string;
    title: string;
    description: string | null;
    start_time: string;
    end_time: string | null;
    track: string | null;
    session_type: string;
    qa_open: boolean;
    created_at: string;
  },
  speakers: SessionSpeaker[]
): EventSession {
  return {
    id: s.id,
    eventId: s.event_id,
    title: s.title,
    description: s.description ?? undefined,
    startTime: s.start_time,
    endTime: s.end_time ?? undefined,
    track: s.track ?? undefined,
    sessionType: s.session_type as EventSession["sessionType"],
    qaOpen: s.qa_open,
    speakers,
    createdAt: s.created_at,
  };
}
function eventSessionToRow(input: Partial<Omit<EventSession, "id" | "createdAt" | "speakers">>) {
  const row: Record<string, unknown> = {};
  if (input.eventId !== undefined) row.event_id = input.eventId;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description || null;
  if (input.startTime !== undefined) row.start_time = input.startTime;
  if (input.endTime !== undefined) row.end_time = input.endTime || null;
  if (input.track !== undefined) row.track = input.track || null;
  if (input.sessionType !== undefined) row.session_type = input.sessionType;
  if (input.qaOpen !== undefined) row.qa_open = input.qaOpen;
  return row;
}
function mapEventSpeakerRow(s: {
  id: string;
  event_id: string;
  name: string;
  title: string | null;
  company: string | null;
  bio: string | null;
  photo_url: string | null;
  created_at: string;
}): EventSpeaker {
  return {
    id: s.id,
    eventId: s.event_id,
    name: s.name,
    title: s.title ?? undefined,
    company: s.company ?? undefined,
    bio: s.bio ?? undefined,
    photoUrl: s.photo_url ?? undefined,
    createdAt: s.created_at,
  };
}
function eventSpeakerToRow(input: Partial<Omit<EventSpeaker, "id" | "createdAt">>) {
  const row: Record<string, unknown> = {};
  if (input.eventId !== undefined) row.event_id = input.eventId;
  if (input.name !== undefined) row.name = input.name;
  if (input.title !== undefined) row.title = input.title || null;
  if (input.company !== undefined) row.company = input.company || null;
  if (input.bio !== undefined) row.bio = input.bio || null;
  if (input.photoUrl !== undefined) row.photo_url = input.photoUrl || null;
  return row;
}
function mapEventOneOnOneRequestRow(r: {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  status: "pending" | "assigned" | "done";
  assignment: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}): EventOneOnOneRequest {
  return {
    id: r.id,
    eventId: r.event_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone ?? undefined,
    note: r.note ?? undefined,
    status: r.status,
    assignment: r.assignment ?? undefined,
    notifiedAt: r.notified_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapEventAnnouncementRow(a: { id: string; event_id: string; body: string; pinned: boolean; created_at: string }): EventAnnouncement {
  return { id: a.id, eventId: a.event_id, body: a.body, pinned: a.pinned, createdAt: a.created_at };
}
function eventAnnouncementToRow(input: Partial<Omit<EventAnnouncement, "id" | "createdAt">>) {
  const row: Record<string, unknown> = {};
  if (input.eventId !== undefined) row.event_id = input.eventId;
  if (input.body !== undefined) row.body = input.body;
  if (input.pinned !== undefined) row.pinned = input.pinned;
  return row;
}
function mapEventGuestRow(g: {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  plus_ones_allowed: number;
  plus_ones_confirmed: number | null;
  status: string;
  registration_id: string | null;
  invited_at: string | null;
  responded_at: string | null;
  created_at: string;
}): EventGuest {
  return {
    id: g.id,
    eventId: g.event_id,
    fullName: g.full_name,
    email: g.email,
    phone: g.phone ?? undefined,
    plusOnesAllowed: g.plus_ones_allowed,
    plusOnesConfirmed: g.plus_ones_confirmed ?? undefined,
    status: g.status as EventGuest["status"],
    registrationId: g.registration_id ?? undefined,
    invitedAt: g.invited_at ?? undefined,
    respondedAt: g.responded_at ?? undefined,
    createdAt: g.created_at,
  };
}
function eventGuestToRow(input: Partial<Omit<EventGuest, "id" | "createdAt" | "status" | "registrationId" | "respondedAt">>) {
  const row: Record<string, unknown> = {};
  if (input.eventId !== undefined) row.event_id = input.eventId;
  if (input.fullName !== undefined) row.full_name = input.fullName;
  if (input.email !== undefined) row.email = input.email;
  if (input.phone !== undefined) row.phone = input.phone || null;
  if (input.plusOnesAllowed !== undefined) row.plus_ones_allowed = input.plusOnesAllowed;
  return row;
}

// ---- org-scoped data fetch (admin via RLS-protected browser client, staff/rep via API) ----

let orgDataFetched = false;
let orgDataFetching = false;
/** The signed-in admin's own organization id — resolved once per session and used
 *  to explicitly scope every org-admin query below, rather than trusting RLS alone
 *  to narrow results. RLS's is_platform_admin() clause is legitimately needed for
 *  the platform portal to read across every org, but it means an account that is
 *  BOTH an org owner and a platform admin would otherwise see every organization's
 *  data inside what should be their own isolated org-admin dashboard — exactly
 *  this collision surfaced a real cross-tenant leak in production. */
let myOrgId: string | null = null;
/** Exported so any client-side query against a table that carries an
 *  `is_platform_admin()` OR-clause can scope itself explicitly instead of
 *  trusting RLS alone — see the file-level comment above for why that matters. */
export async function resolveMyOrgId(supabase: ReturnType<typeof createSupabaseBrowserClient>): Promise<string | null> {
  if (myOrgId) return myOrgId;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("organizations").select("id").eq("owner_user_id", user.id).maybeSingle();
  myOrgId = data?.id ?? null;
  return myOrgId;
}

async function fetchAdminData() {
  if (!supabaseConfigured()) return;
  orgDataFetching = true;
  try {
    const supabase = createSupabaseBrowserClient();
    const orgId = await resolveMyOrgId(supabase);
    if (!orgId) {
      // No owned organization for this user — nothing to show, and critically,
      // never fall through to an unfiltered query that RLS might widen for a
      // platform admin.
      destinationsCache = [];
      universitiesCache = [];
      eventsCache = [];
      staffCache = [];
      leadsCache = [];
      registrationsCache = [];
      ticketTypesCache = [];
      discountCodesCache = [];
      eventSessionsCache = [];
      eventSpeakersCache = [];
      eventOneOnOneRequestsCache = [];
      eventAnnouncementsCache = [];
      eventGuestsCache = [];
      orgDataFetched = true;
      return;
    }
    const [
      destRes,
      uniRes,
      eventRes,
      staffRes,
      leadRes,
      registrationRes,
      ticketTypeRes,
      discountCodeRes,
      sessionRes,
      speakerRes,
      sessionSpeakerRes,
      oneOnOneRequestRes,
      announcementRes,
      guestRes,
    ] = await Promise.all([
      supabase.from("destinations").select("*").eq("organization_id", orgId),
      supabase.from("universities").select("*").eq("organization_id", orgId),
      supabase.from("events").select("*").eq("organization_id", orgId),
      supabase.from("staff").select("*").eq("organization_id", orgId),
      supabase.from("leads").select("*").eq("organization_id", orgId),
      supabase.from("registrations").select("*").eq("organization_id", orgId),
      supabase.from("ticket_types").select("*").eq("organization_id", orgId),
      supabase.from("discount_codes").select("*").eq("organization_id", orgId),
      supabase.from("event_sessions").select("*").eq("organization_id", orgId),
      supabase.from("event_speakers").select("*").eq("organization_id", orgId),
      // No organization_id column on this join table — scoped below via the
      // (already org-filtered) session ids instead.
      supabase.from("event_session_speakers").select("*"),
      supabase.from("event_one_on_one_requests").select("*").eq("organization_id", orgId),
      supabase.from("event_announcements").select("*").eq("organization_id", orgId),
      supabase.from("event_guests").select("*").eq("organization_id", orgId),
    ]);
    destinationsCache = (destRes.data ?? []).map(mapDestinationRow);
    universitiesCache = (uniRes.data ?? []).map(mapUniversityRow);
    eventsCache = (eventRes.data ?? []).map(mapEventRow);
    staffCache = (staffRes.data ?? []).map(mapStaffRow);
    leadsCache = (leadRes.data ?? []).map(mapLeadRow);
    registrationsCache = (registrationRes.data ?? []).map(mapRegistrationRow);
    ticketTypesCache = (ticketTypeRes.data ?? []).map(mapTicketTypeRow);
    discountCodesCache = (discountCodeRes.data ?? []).map(mapDiscountCodeRow);
    eventSpeakersCache = (speakerRes.data ?? []).map(mapEventSpeakerRow);
    const speakersById = new Map(eventSpeakersCache.map((s) => [s.id, s]));
    const ownSessionIds = new Set((sessionRes.data ?? []).map((s: { id: string }) => s.id));
    const sessionSpeakersById = new Map<string, SessionSpeaker[]>();
    for (const link of (sessionSpeakerRes.data ?? []) as { id: string; session_id: string; speaker_id: string; role: string }[]) {
      if (!ownSessionIds.has(link.session_id)) continue;
      const speaker = speakersById.get(link.speaker_id);
      if (!speaker) continue;
      const arr = sessionSpeakersById.get(link.session_id) ?? [];
      arr.push({ assignmentId: link.id, speakerId: link.speaker_id, name: speaker.name, photoUrl: speaker.photoUrl, role: link.role as SessionSpeaker["role"] });
      sessionSpeakersById.set(link.session_id, arr);
    }
    eventSessionsCache = (sessionRes.data ?? []).map((s) => mapEventSessionRow(s, sessionSpeakersById.get(s.id) ?? []));
    eventOneOnOneRequestsCache = (oneOnOneRequestRes.data ?? []).map(mapEventOneOnOneRequestRow);
    eventAnnouncementsCache = (announcementRes.data ?? []).map(mapEventAnnouncementRow);
    eventGuestsCache = (guestRes.data ?? []).map(mapEventGuestRow);
    orgDataFetched = true;
  } finally {
    orgDataFetching = false;
    emitChange();
  }
}

async function fetchSessionData() {
  if (!sessionCache || !supabaseConfigured()) return;
  orgDataFetching = true;
  try {
    // POST, not GET+query-string — staffId is a long-lived bearer credential (see
    // session-data/route.ts) and a query string is the one place it would otherwise
    // land in server access logs, CDN logs, and browser history.
    const res = await fetch("/api/session-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: sessionCache.id }),
    });
    const json = await res.json();
    if (res.ok) {
      destinationsCache = json.destinations ?? [];
      universitiesCache = json.universities ?? [];
      eventsCache = json.events ?? [];
      leadsCache = json.leads ?? [];
    }
    orgDataFetched = true;
  } finally {
    orgDataFetching = false;
    emitChange();
  }
}

function ensureDataFetched() {
  if (orgDataFetched || orgDataFetching || !sessionCache) return;
  if (sessionCache.role === "admin") fetchAdminData();
  else fetchSessionData();
}

/** Force a refetch of org-scoped data (events/leads/registrations/staff/...) right now,
 *  bypassing the "already fetched" cache. Use where staleness is likely to matter —
 *  e.g. reopening a view that shows check-in status another device just changed —
 *  rather than waiting on the window-focus revalidation in useRevalidateOnFocus. */
export async function refreshData(): Promise<void> {
  if (!sessionCache || orgDataFetching) return;
  orgDataFetched = false;
  if (sessionCache.role === "admin") await fetchAdminData();
  else await fetchSessionData();
}

/** Refetch when the tab regains focus, so multi-device changes (e.g. a staff member's
 *  new lead) show up without a full reload. Cheap SWR-style revalidation — not full
 *  realtime, but covers the common case of switching back to an already-open tab. */
function useRevalidateOnFocus() {
  useEffect(() => {
    function onFocus() {
      if (!sessionCache) return;
      orgDataFetched = false;
      ensureDataFetched();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
}

function useEnsureDataFetched() {
  const session = useSyncExternalStore(subscribe, sessionSnap.client, sessionSnap.server);
  useEffect(() => {
    ensureDataFetched();
  }, [session?.id, session?.role]);
  useRevalidateOnFocus();
}

function snap<T>(getCache: () => T, seed: T) {
  return {
    client: () => {
      hydrateSession();
      return getCache();
    },
    server: () => seed,
  };
}

const dataReadySnap = snap(() => orgDataFetched, false);

/** True once the org-scoped data (events/leads/etc.) has loaded at least once for the
 *  current session. Data arrives async now (Supabase/API fetch, not synchronous
 *  localStorage) — check this before trusting a "not found" branch on first render. */
export function useDataReady() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, dataReadySnap.client, dataReadySnap.server);
}

const destinationsSnap = snap(() => destinationsCache, [] as Destination[]);
const universitiesSnap = snap(() => universitiesCache, [] as University[]);
const eventsSnap = snap(() => eventsCache, [] as EventRecord[]);
const staffSnap = snap(() => staffCache, [] as StaffRecord[]);
const leadsSnap = snap(() => leadsCache, [] as LeadRecord[]);
const registrationsSnap = snap(() => registrationsCache, [] as RegistrationRecord[]);
const ticketTypesSnap = snap(() => ticketTypesCache, [] as TicketType[]);
const discountCodesSnap = snap(() => discountCodesCache, [] as DiscountCode[]);
const eventSessionsSnap = snap(() => eventSessionsCache, [] as EventSession[]);
const eventSpeakersSnap = snap(() => eventSpeakersCache, [] as EventSpeaker[]);
const eventOneOnOneRequestsSnap = snap(() => eventOneOnOneRequestsCache, [] as EventOneOnOneRequest[]);
const eventAnnouncementsSnap = snap(() => eventAnnouncementsCache, [] as EventAnnouncement[]);
const eventGuestsSnap = snap(() => eventGuestsCache, [] as EventGuest[]);
const sessionSnap = snap<Session | null>(() => sessionCache, null);

export function useDestinations() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, destinationsSnap.client, destinationsSnap.server);
}
export function useUniversities() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, universitiesSnap.client, universitiesSnap.server);
}
export function useEvents() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, eventsSnap.client, eventsSnap.server);
}
export function useStaff() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, staffSnap.client, staffSnap.server);
}
export function useLeads() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, leadsSnap.client, leadsSnap.server);
}
export function useRegistrations() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, registrationsSnap.client, registrationsSnap.server);
}
export function useSession() {
  return useSyncExternalStore(subscribe, sessionSnap.client, sessionSnap.server);
}
export function useTicketTypes() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, ticketTypesSnap.client, ticketTypesSnap.server);
}
export function useDiscountCodes() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, discountCodesSnap.client, discountCodesSnap.server);
}
export function useEventSessions() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, eventSessionsSnap.client, eventSessionsSnap.server);
}
export function useEventSpeakers() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, eventSpeakersSnap.client, eventSpeakersSnap.server);
}
export function useEventOneOnOneRequests() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, eventOneOnOneRequestsSnap.client, eventOneOnOneRequestsSnap.server);
}
export function useEventAnnouncements() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, eventAnnouncementsSnap.client, eventAnnouncementsSnap.server);
}
export function useEventGuests() {
  useEnsureDataFetched();
  return useSyncExternalStore(subscribe, eventGuestsSnap.client, eventGuestsSnap.server);
}

// ---- getters (read the in-memory cache; components should prefer the hooks above so
//      they re-render on change — these are for one-off lookups inside handlers) ----

export function getDestinationById(id?: string): Destination | undefined {
  return id ? destinationsCache.find((d) => d.id === id) : undefined;
}
export function getUniversityById(id?: string): University | undefined {
  return id ? universitiesCache.find((u) => u.id === id) : undefined;
}
export function getUniversitiesForDestination(destId: string): University[] {
  return universitiesCache.filter((u) => u.destinationId === destId);
}
export function getEventById(id: string): EventRecord | undefined {
  return eventsCache.find((e) => e.id === id);
}
export function getLeadsForEvent(eventId: string): LeadRecord[] {
  return leadsCache.filter((l) => l.eventId === eventId);
}
export function getRegistrationsForEvent(eventId: string): RegistrationRecord[] {
  return registrationsCache.filter((r) => r.eventId === eventId);
}
export function getTicketTypesForEvent(eventId: string): TicketType[] {
  return ticketTypesCache.filter((t) => t.eventId === eventId);
}
export function getDiscountCodesForEvent(eventId: string): DiscountCode[] {
  return discountCodesCache.filter((d) => d.eventId === eventId);
}
export function getSessionsForEvent(eventId: string): EventSession[] {
  return eventSessionsCache.filter((s) => s.eventId === eventId).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}
export function getSpeakersForEvent(eventId: string): EventSpeaker[] {
  return eventSpeakersCache.filter((s) => s.eventId === eventId);
}
export function getOneOnOneRequestsForEvent(eventId: string): EventOneOnOneRequest[] {
  return eventOneOnOneRequestsCache.filter((r) => r.eventId === eventId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function getAnnouncementsForEvent(eventId: string): EventAnnouncement[] {
  return eventAnnouncementsCache.filter((a) => a.eventId === eventId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function getGuestsForEvent(eventId: string): EventGuest[] {
  return eventGuestsCache.filter((g) => g.eventId === eventId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Admin-side manual check-in/undo, direct via the RLS-scoped browser client — the
 *  admin owns this org's registrations outright, unlike the door-staff flow in
 *  /api/checkin which goes through the service-role API since staff isn't a Supabase
 *  Auth user. Lets an admin mark someone checked-in from the dashboard itself instead
 *  of only via a physical scan at the door. */
export async function updateRegistrationStatus(id: string, status: RegistrationRecord["status"]): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const patch: { status: RegistrationRecord["status"]; checked_in_at: string | null; checked_in_by: string | null } = {
    status,
    checked_in_at: status === "checked_in" ? new Date().toISOString() : null,
    checked_in_by: status === "checked_in" ? sessionCache?.name || sessionCache?.id || null : null,
  };
  const { data, error } = await supabase.from("registrations").update(patch).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapRegistrationRow(data);
  registrationsCache = registrationsCache.map((r) => (r.id === id ? record : r));
  emitChange();
}

/** Approve/decline/promote a pending or waitlisted registration or lead — routed
 *  through the server (unlike updateRegistrationStatus above) because it can also
 *  need to touch ticket_types.quantity_sold and send an email, both of which need
 *  the service-role client. See /api/orgs/[slug]/events/[eventId]/registrations/decision. */
export async function decideRegistration(
  orgSlug: string,
  eventId: string,
  id: string,
  kind: "registration" | "lead",
  action: "approve" | "decline" | "promote"
): Promise<RegistrationRecord["status"]> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/registrations/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, kind, action }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't update this registration.");
  const newStatus = json.status as RegistrationRecord["status"];
  if (kind === "registration") {
    registrationsCache = registrationsCache.map((r) => (r.id === id ? { ...r, status: newStatus } : r));
  } else {
    leadsCache = leadsCache.map((l) => (l.id === id ? { ...l, status: newStatus as LeadRecord["status"] } : l));
  }
  emitChange();
  return newStatus;
}

/** Organizer self-service refund — actually reverses the Paystack charge (see
 *  /api/orgs/[slug]/events/[eventId]/registrations/refund), then marks the
 *  registration cancelled locally to match what the server just did. Physical
 *  registrations only — see that route's own doc comment for why. */
export async function refundRegistration(orgSlug: string, eventId: string, registrationId: string): Promise<void> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/registrations/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't process this refund.");
  registrationsCache = registrationsCache.map((r) => (r.id === registrationId ? { ...r, status: "cancelled" } : r));
  emitChange();
}
export function getLeadsFiltered(eventId?: string, destId?: string, uniId?: string): LeadRecord[] {
  return leadsCache.filter((l) => {
    if (eventId && l.eventId !== eventId) return false;
    if (destId && l.destinationId !== destId) return false;
    if (uniId && l.universityId !== uniId) return false;
    return true;
  });
}

// ---- event CRUD (admin only — browser client, RLS + auto-filled organization_id) ----

function slugifyEventName(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event"
  );
}

/** Creates the lightweight grouping row a recurring event's occurrences all link
 *  back to via events.series_id — see migration 0063. Named after the event
 *  itself (every occurrence shares that name anyway); there's no separate
 *  series-level UI to edit this today, it exists purely for the dashboard to
 *  group and count occurrences. */
export async function addEventSeries(name: string): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) throw new PersistError(undefined);
  const { data, error } = await supabase.from("event_series").insert({ organization_id: orgId, name }).select("id").single();
  if (error || !data) throw new PersistError(error);
  return data.id;
}

/** Every new event gets a real, human-readable slug from the start (not left null
 *  until an organizer thinks to set one) — it's what makes /discover/[slug] a
 *  universal public link format. Uniqueness is global across every organization
 *  (events_slug_key, migration 0057), and this browser-side client can't read other
 *  orgs' rows to pre-check a candidate under RLS — so it just attempts the insert and
 *  retries with a numeric suffix on a real 23505 conflict, exactly like the dashboard's
 *  manual slug editor already does for the update path. */
export async function addEvent(input: Omit<EventRecord, "id" | "createdAt">): Promise<EventRecord> {
  const supabase = createSupabaseBrowserClient();
  const baseSlug = input.slug ? slugifyEventName(input.slug) : slugifyEventName(input.name);
  let candidate = baseSlug;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { data, error } = await supabase
      .from("events")
      .insert(eventToRow({ ...input, slug: candidate }))
      .select()
      .single();
    if (data) {
      const record = mapEventRow(data);
      eventsCache = [...eventsCache, record];
      emitChange();
      return record;
    }
    if (error?.code === "23505" && error.message.includes("slug") && attempt < 6) {
      candidate = `${baseSlug}-${attempt + 1}`;
      continue;
    }
    throw new PersistError(error);
  }
  throw new PersistError(undefined);
}
export async function updateEvent(id: string, patch: Partial<Omit<EventRecord, "id" | "createdAt">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("events").update(eventToRow(patch)).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventRow(data);
  eventsCache = eventsCache.map((e) => (e.id === id ? record : e));
  emitChange();
}

/** Clones an event (destinations, venue, cover image, description) as a new
 *  event — deliberately not its leads, since those belong to the original
 *  fair, not the copy. */
export async function duplicateEvent(id: string): Promise<EventRecord | undefined> {
  const source = eventsCache.find((e) => e.id === id);
  if (!source) return undefined;
  // Cleared, not carried over — otherwise addEvent would try to reuse the source
  // event's own slug as its base candidate instead of deriving a fresh one from
  // the "(Copy)" name.
  return addEvent({ ...source, name: `${source.name} (Copy)`, published: true, slug: undefined });
}

/** Deletes an event and, via the DB's cascading foreign key, every lead collected for
 *  it — irreversible. Any staff assigned to it just have their event unset, they aren't
 *  deleted. Callers must confirm with the admin before calling this. */
export async function deleteEvent(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new PersistError(error);
  eventsCache = eventsCache.filter((e) => e.id !== id);
  leadsCache = leadsCache.filter((l) => l.eventId !== id);
  registrationsCache = registrationsCache.filter((r) => r.eventId !== id);
  ticketTypesCache = ticketTypesCache.filter((t) => t.eventId !== id);
  discountCodesCache = discountCodesCache.filter((d) => d.eventId !== id);
  eventSessionsCache = eventSessionsCache.filter((s) => s.eventId !== id);
  eventSpeakersCache = eventSpeakersCache.filter((s) => s.eventId !== id);
  eventAnnouncementsCache = eventAnnouncementsCache.filter((a) => a.eventId !== id);
  emitChange();
}

// ---- ticket type CRUD (admin only — browser client, RLS + auto-filled organization_id) ----

export async function addTicketType(input: Omit<TicketType, "id" | "createdAt" | "quantitySold">): Promise<TicketType> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("ticket_types").insert(ticketTypeToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapTicketTypeRow(data);
  ticketTypesCache = [...ticketTypesCache, record];
  emitChange();
  return record;
}
export async function updateTicketType(id: string, patch: Partial<Omit<TicketType, "id" | "createdAt" | "quantitySold">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("ticket_types").update(ticketTypeToRow(patch)).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapTicketTypeRow(data);
  ticketTypesCache = ticketTypesCache.map((t) => (t.id === id ? record : t));
  emitChange();
}
export async function deleteTicketType(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("ticket_types").delete().eq("id", id);
  if (error) throw new PersistError(error);
  ticketTypesCache = ticketTypesCache.filter((t) => t.id !== id);
  emitChange();
}

// ---- discount code CRUD (admin only — browser client, RLS + auto-filled organization_id) ----

export async function addDiscountCode(input: Omit<DiscountCode, "id" | "createdAt" | "usesCount">): Promise<DiscountCode> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("discount_codes").insert(discountCodeToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapDiscountCodeRow(data);
  discountCodesCache = [...discountCodesCache, record];
  emitChange();
  return record;
}
export async function updateDiscountCode(id: string, patch: Partial<Omit<DiscountCode, "id" | "createdAt" | "usesCount">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("discount_codes").update(discountCodeToRow(patch)).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapDiscountCodeRow(data);
  discountCodesCache = discountCodesCache.map((d) => (d.id === id ? record : d));
  emitChange();
}
export async function deleteDiscountCode(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("discount_codes").delete().eq("id", id);
  if (error) throw new PersistError(error);
  discountCodesCache = discountCodesCache.filter((d) => d.id !== id);
  emitChange();
}

// ---- event sessions / speakers / announcements CRUD (admin only — browser client,
//      RLS + auto-filled organization_id; see 0035_event_hub.sql) ----

/** Re-reads sessions, the speaker roster, and the session<->speaker links together and
 *  rebuilds both caches — simpler and less error-prone than hand-patching the
 *  denormalized speaker name/photo copied onto each EventSession's speakers array,
 *  and cheap since these tables are small and bounded per event. */
async function refetchSessionsAndSpeakers(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) return;
  const [sessionRes, speakerRes, sessionSpeakerRes] = await Promise.all([
    supabase.from("event_sessions").select("*").eq("organization_id", orgId),
    supabase.from("event_speakers").select("*").eq("organization_id", orgId),
    supabase.from("event_session_speakers").select("*"),
  ]);
  eventSpeakersCache = (speakerRes.data ?? []).map(mapEventSpeakerRow);
  const speakersById = new Map(eventSpeakersCache.map((s) => [s.id, s]));
  const ownSessionIds = new Set((sessionRes.data ?? []).map((s: { id: string }) => s.id));
  const sessionSpeakersById = new Map<string, SessionSpeaker[]>();
  for (const link of (sessionSpeakerRes.data ?? []) as { id: string; session_id: string; speaker_id: string; role: string }[]) {
    if (!ownSessionIds.has(link.session_id)) continue;
    const speaker = speakersById.get(link.speaker_id);
    if (!speaker) continue;
    const arr = sessionSpeakersById.get(link.session_id) ?? [];
    arr.push({ assignmentId: link.id, speakerId: link.speaker_id, name: speaker.name, photoUrl: speaker.photoUrl, role: link.role as SessionSpeaker["role"] });
    sessionSpeakersById.set(link.session_id, arr);
  }
  eventSessionsCache = (sessionRes.data ?? []).map((s) => mapEventSessionRow(s, sessionSpeakersById.get(s.id) ?? []));
  emitChange();
}

export async function addEventSession(input: Omit<EventSession, "id" | "createdAt" | "speakers">): Promise<EventSession> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("event_sessions").insert(eventSessionToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventSessionRow(data, []);
  eventSessionsCache = [...eventSessionsCache, record];
  emitChange();
  return record;
}
export async function updateEventSession(id: string, patch: Partial<Omit<EventSession, "id" | "createdAt" | "speakers">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("event_sessions").update(eventSessionToRow(patch)).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const existingSpeakers = eventSessionsCache.find((s) => s.id === id)?.speakers ?? [];
  const record = mapEventSessionRow(data, existingSpeakers);
  eventSessionsCache = eventSessionsCache.map((s) => (s.id === id ? record : s));
  emitChange();
}
export async function deleteEventSession(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_sessions").delete().eq("id", id);
  if (error) throw new PersistError(error);
  eventSessionsCache = eventSessionsCache.filter((s) => s.id !== id);
  emitChange();
}

export async function addEventSpeaker(input: Omit<EventSpeaker, "id" | "createdAt">): Promise<EventSpeaker> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("event_speakers").insert(eventSpeakerToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventSpeakerRow(data);
  eventSpeakersCache = [...eventSpeakersCache, record];
  emitChange();
  return record;
}
export async function updateEventSpeaker(id: string, patch: Partial<Omit<EventSpeaker, "id" | "createdAt">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_speakers").update(eventSpeakerToRow(patch)).eq("id", id);
  if (error) throw new PersistError(error);
  // A speaker's name/photo is denormalized onto every session they're assigned to —
  // refetch rather than hand-patch every affected EventSession.speakers entry.
  await refetchSessionsAndSpeakers();
}
export async function deleteEventSpeaker(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_speakers").delete().eq("id", id);
  if (error) throw new PersistError(error);
  await refetchSessionsAndSpeakers();
}

/** Organizer-side update once they've worked out the matching themselves — sets
 *  status and/or the free-text assignment (booth/room/stand/speaker). Nothing here
 *  ever creates a request; those only ever come from the public interest-request
 *  route (see /api/orgs/[slug]/events/[eventId]/one-on-one/request). */
export async function updateOneOnOneRequest(id: string, patch: { status?: EventOneOnOneRequest["status"]; assignment?: string }): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assignment !== undefined) row.assignment = patch.assignment || null;
  const { data, error } = await supabase.from("event_one_on_one_requests").update(row).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventOneOnOneRequestRow(data);
  eventOneOnOneRequestsCache = eventOneOnOneRequestsCache.map((r) => (r.id === id ? record : r));
  emitChange();
}

/** Patches the client cache after a successful notify-attendee call (see
 *  /api/orgs/[slug]/events/[eventId]/one-on-one/[requestId]/notify) — that route
 *  does the actual write server-side (it needs the service-role client to send the
 *  email), so this just reflects the result the route already confirmed. */
export function markOneOnOneRequestNotified(id: string, notifiedAt: string): void {
  eventOneOnOneRequestsCache = eventOneOnOneRequestsCache.map((r) => (r.id === id ? { ...r, notifiedAt } : r));
  emitChange();
}

export async function assignSpeakerToSession(sessionId: string, speakerId: string, role: SessionSpeaker["role"]): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_session_speakers").insert({ session_id: sessionId, speaker_id: speakerId, role });
  if (error) throw new PersistError(error);
  await refetchSessionsAndSpeakers();
}
export async function removeSpeakerFromSession(assignmentId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_session_speakers").delete().eq("id", assignmentId);
  if (error) throw new PersistError(error);
  await refetchSessionsAndSpeakers();
}

export async function addAnnouncement(input: Omit<EventAnnouncement, "id" | "createdAt">): Promise<EventAnnouncement> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("event_announcements").insert(eventAnnouncementToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventAnnouncementRow(data);
  eventAnnouncementsCache = [...eventAnnouncementsCache, record];
  emitChange();
  return record;
}
export async function updateAnnouncement(id: string, patch: Partial<Omit<EventAnnouncement, "id" | "createdAt">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("event_announcements").update(eventAnnouncementToRow(patch)).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventAnnouncementRow(data);
  eventAnnouncementsCache = eventAnnouncementsCache.map((a) => (a.id === id ? record : a));
  emitChange();
}
export async function deleteAnnouncement(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_announcements").delete().eq("id", id);
  if (error) throw new PersistError(error);
  eventAnnouncementsCache = eventAnnouncementsCache.filter((a) => a.id !== id);
  emitChange();
}

export async function addEventGuest(input: Omit<EventGuest, "id" | "createdAt" | "status" | "registrationId" | "invitedAt" | "respondedAt">): Promise<EventGuest> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("event_guests").insert(eventGuestToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventGuestRow(data);
  eventGuestsCache = [record, ...eventGuestsCache];
  emitChange();
  return record;
}
/** CSV/bulk-paste import — same shape as a single add, just N rows in one insert
 *  so a 200-guest list doesn't fire 200 round trips. */
export async function bulkAddEventGuests(eventId: string, guests: { fullName: string; email: string; phone?: string; plusOnesAllowed?: number }[]): Promise<EventGuest[]> {
  const supabase = createSupabaseBrowserClient();
  const rows = guests.map((g) => eventGuestToRow({ eventId, fullName: g.fullName, email: g.email, phone: g.phone, plusOnesAllowed: g.plusOnesAllowed ?? 0 }));
  const { data, error } = await supabase.from("event_guests").insert(rows).select();
  if (error) throw new PersistError(error);
  const records = (data ?? []).map(mapEventGuestRow);
  eventGuestsCache = [...records, ...eventGuestsCache];
  emitChange();
  return records;
}
export async function deleteEventGuest(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_guests").delete().eq("id", id);
  if (error) throw new PersistError(error);
  eventGuestsCache = eventGuestsCache.filter((g) => g.id !== id);
  emitChange();
}
/** Patches invitedAt locally after /guests/invite succeeds — that route runs
 *  server-side (it sends real email via Resend) and returns which guest ids it
 *  actually sent to, so the UI reflects "invited" without a full refetch. */
export function markGuestsInvited(guestIds: string[]): void {
  const now = new Date().toISOString();
  const ids = new Set(guestIds);
  eventGuestsCache = eventGuestsCache.map((g) => (ids.has(g.id) ? { ...g, invitedAt: now } : g));
  emitChange();
}

// ---- Q&A moderation (admin only) — deliberately NOT part of the cached/reactive
//      store above: question volume is unbounded (unlike sessions/speakers), and the
//      moderation queue needs its own frequent polling for freshness anyway, so a
//      component-local fetch is simpler than keeping a global cache current. ----

function mapEventQuestionRow(q: {
  id: string;
  event_id: string;
  session_id: string | null;
  speaker_id: string | null;
  asked_by_name: string;
  question_text: string;
  status: string;
  upvote_count: number;
  created_at: string;
}): EventQuestion {
  return {
    id: q.id,
    eventId: q.event_id,
    sessionId: q.session_id ?? undefined,
    speakerId: q.speaker_id ?? undefined,
    askedByName: q.asked_by_name,
    questionText: q.question_text,
    status: q.status as EventQuestion["status"],
    upvoteCount: q.upvote_count,
    createdAt: q.created_at,
  };
}

export async function listEventQuestions(eventId: string): Promise<EventQuestion[]> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("event_questions")
    .select("*")
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new PersistError(error);
  return (data ?? []).map(mapEventQuestionRow);
}
export async function moderateQuestion(id: string, status: EventQuestion["status"]): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_questions").update({ status, moderated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new PersistError(error);
}

// ---- live polls (admin only) — same on-demand, not-globally-cached treatment as
//      Q&A above, for the same reason (needs its own frequent polling anyway). ----

function mapEventPollRow(
  p: { id: string; event_id: string; session_id: string | null; question: string; status: string; created_at: string },
  options: { id: string; label: string; vote_count: number }[]
): EventPoll {
  return {
    id: p.id,
    eventId: p.event_id,
    sessionId: p.session_id ?? undefined,
    question: p.question,
    status: p.status as PollStatus,
    options: options.map((o) => ({ id: o.id, label: o.label, voteCount: o.vote_count })),
    createdAt: p.created_at,
  };
}

export async function listEventPolls(eventId: string): Promise<EventPoll[]> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) return [];
  const pollRes = await supabase
    .from("event_polls")
    .select("*")
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (pollRes.error) throw new PersistError(pollRes.error);
  const pollIds = (pollRes.data ?? []).map((p) => p.id);
  // Scoped via the already org-verified poll ids above, rather than a bare
  // unfiltered select — event_poll_options has no organization_id column of its
  // own to filter by directly.
  const optionRes = pollIds.length
    ? await supabase.from("event_poll_options").select("*").in("poll_id", pollIds).order("position", { ascending: true })
    : { data: [], error: null };
  if (optionRes.error) throw new PersistError(optionRes.error);
  const optionsByPoll = new Map<string, { id: string; label: string; vote_count: number }[]>();
  for (const o of (optionRes.data ?? []) as { id: string; poll_id: string; label: string; vote_count: number }[]) {
    const arr = optionsByPoll.get(o.poll_id) ?? [];
    arr.push(o);
    optionsByPoll.set(o.poll_id, arr);
  }
  return (pollRes.data ?? []).map((p) => mapEventPollRow(p, optionsByPoll.get(p.id) ?? []));
}

export async function createPoll(input: { eventId: string; sessionId?: string; question: string; options: string[] }): Promise<EventPoll> {
  const supabase = createSupabaseBrowserClient();
  const { data: poll, error: pollError } = await supabase
    .from("event_polls")
    .insert({ event_id: input.eventId, session_id: input.sessionId || null, question: input.question, status: "draft" })
    .select()
    .single();
  if (pollError || !poll) throw new PersistError(pollError);
  const { data: options, error: optionError } = await supabase
    .from("event_poll_options")
    .insert(input.options.map((label, i) => ({ poll_id: poll.id, label, position: i })))
    .select();
  if (optionError) throw new PersistError(optionError);
  return mapEventPollRow(poll, (options ?? []).map((o) => ({ ...o, vote_count: 0 })));
}
export async function updatePollStatus(id: string, status: PollStatus): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_polls").update({ status }).eq("id", id);
  if (error) throw new PersistError(error);
}
export async function deletePoll(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("event_polls").delete().eq("id", id);
  if (error) throw new PersistError(error);
}

/** On-demand, not cached like the rest of this file — a code's redemption history
 *  is only ever looked at when an admin explicitly opens it, so there's no reason to
 *  keep every org's full transaction history in memory alongside everything else.
 *  Reads paystack_transactions directly (RLS already scopes it to the caller's own
 *  org — see paystack_transactions_select_own_org) rather than a separate table,
 *  since "who used this code" is just its own successful transactions. */
export async function getDiscountCodeRedemptions(discountCodeId: string): Promise<DiscountRedemption[]> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("paystack_transactions")
    .select("amount_naira, verified_at, created_at, registrant_data")
    .eq("discount_code_id", discountCodeId)
    .eq("organization_id", orgId)
    .eq("status", "success")
    .order("verified_at", { ascending: false });
  if (error) throw new PersistError(error);
  return (data ?? []).map((t) => {
    const info = t.registrant_data as { firstName?: string; lastName?: string; email?: string } | null;
    return {
      fullName: info ? `${info.firstName ?? ""} ${info.lastName ?? ""}`.trim() : "—",
      email: info?.email ?? "—",
      amountPaidNaira: Number(t.amount_naira),
      purchasedAt: t.verified_at ?? t.created_at,
    };
  });
}

/** On-demand, not cached — every paid-ticket checkout attempt for one event,
 *  successful or not. Feeds both the Tickets tab's sales-overview totals
 *  (filter to status === "success") and its abandoned-checkout list (filter to
 *  status === "pending") from a single query, same RLS-scoped read pattern as
 *  getDiscountCodeRedemptions above. */
export async function getEventTicketTransactions(eventId: string): Promise<TicketPurchaseAttempt[]> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("paystack_transactions")
    .select("ticket_type_id, discount_code_id, amount_naira, status, created_at, registrant_data")
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .eq("purpose", "ticket_purchase")
    .order("created_at", { ascending: false });
  if (error) throw new PersistError(error);
  return (data ?? []).map((t) => {
    const info = t.registrant_data as { firstName?: string; lastName?: string; email?: string } | null;
    return {
      ticketTypeId: t.ticket_type_id,
      discountCodeId: t.discount_code_id,
      amountNaira: Number(t.amount_naira),
      status: t.status as TicketPurchaseAttempt["status"],
      fullName: info ? `${info.firstName ?? ""} ${info.lastName ?? ""}`.trim() : "—",
      email: info?.email ?? "—",
      createdAt: t.created_at,
    };
  });
}

/** On-demand, not cached — every visitor who typed a plausible email into this
 *  event's registration form, whether or not they ever submitted it. The
 *  caller is expected to exclude anyone who already appears in this event's
 *  registrations or paystack_transactions (getEventTicketTransactions) — this
 *  function only reports raw form-start rows, not "true" abandonment. */
export async function getEventFormStarts(eventId: string): Promise<RegistrationFormStart[]> {
  const supabase = createSupabaseBrowserClient();
  const orgId = await resolveMyOrgId(supabase);
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("registration_form_starts")
    .select("email, full_name, ticket_type_id, updated_at")
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) throw new PersistError(error);
  return (data ?? []).map((r) => ({
    email: r.email,
    fullName: r.full_name,
    ticketTypeId: r.ticket_type_id,
    updatedAt: r.updated_at,
  }));
}

// ---- lead CRUD ----

/** Admin path (reading via the RLS-scoped browser client, e.g. for a manual re-fetch)
 *  isn't used to submit leads — only staff does that, via the /api/leads route below
 *  since staff isn't a Supabase Auth user. */
export async function addLead(input: Omit<LeadRecord, "id" | "createdAt">): Promise<LeadRecord> {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new PersistError(json.error);
  const record: LeadRecord = { ...input, id: json.id, createdAt: new Date().toISOString() };
  leadsCache = [...leadsCache, record];
  emitChange();
  return record;
}

// ---- staff / rep CRUD (admin only — managing the roster in Settings) ----

export async function addStaff(input: Omit<StaffRecord, "id">): Promise<StaffRecord> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("staff")
    .insert({
      name: input.name,
      email: input.email || null,
      role: input.role,
      destination_id: input.destinationId || null,
      university_id: input.universityId || null,
      event_id: input.eventId || null,
      is_online: input.isOnline ?? false,
    })
    .select()
    .single();
  if (error || !data) throw new PersistError(error);
  const record = mapStaffRow(data);
  staffCache = [...staffCache, record];
  emitChange();
  return record;
}
export async function updateStaff(id: string, patch: Partial<Omit<StaffRecord, "id">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.email !== undefined) row.email = patch.email || null;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.destinationId !== undefined) row.destination_id = patch.destinationId || null;
  if (patch.universityId !== undefined) row.university_id = patch.universityId || null;
  if (patch.eventId !== undefined) row.event_id = patch.eventId || null;
  if (patch.isOnline !== undefined) row.is_online = patch.isOnline;
  const { data, error } = await supabase.from("staff").update(row).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapStaffRow(data);
  staffCache = staffCache.map((s) => (s.id === id ? record : s));
  emitChange();
}
export async function deleteStaff(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("staff").delete().eq("id", id);
  if (error) throw new PersistError(error);
  staffCache = staffCache.filter((s) => s.id !== id);
  emitChange();
}

// ---- university / destination CRUD (admin only) ----

export async function addUniversity(input: Omit<University, "id">): Promise<University> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("universities")
    .insert({ id: newId("uni"), destination_id: input.destinationId, name: input.name, short_name: input.shortName.trim() || input.name })
    .select()
    .single();
  if (error || !data) throw new PersistError(error);
  const record = mapUniversityRow(data);
  universitiesCache = [...universitiesCache, record];
  emitChange();
  return record;
}
export async function updateUniversity(id: string, patch: Partial<Omit<University, "id">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const row: Record<string, unknown> = {};
  if (patch.destinationId !== undefined) row.destination_id = patch.destinationId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.shortName !== undefined) row.short_name = patch.shortName.trim() || patch.name || "";
  const { data, error } = await supabase.from("universities").update(row).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapUniversityRow(data);
  universitiesCache = universitiesCache.map((u) => (u.id === id ? record : u));
  emitChange();
}
export async function deleteUniversity(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("universities").delete().eq("id", id);
  if (error) throw new PersistError(error);
  universitiesCache = universitiesCache.filter((u) => u.id !== id);
  emitChange();
}

/** Destinations belong to exactly one event (see the Destination type) — every
 *  write here also keeps that event's own `destinationIds` array in sync, since a
 *  handful of existing screens (dashboard filters, staff/rep check-in pickers,
 *  analytics) still read "this event's destinations" via that array rather than
 *  filtering by eventId directly, and it stays a correct, event-scoped list now
 *  that destinations are no longer shared. */
export async function addDestination(input: Omit<Destination, "id">): Promise<Destination> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("destinations")
    .insert({ id: newId("dest"), event_id: input.eventId, name: input.name, flag: input.flag })
    .select()
    .single();
  if (error || !data) throw new PersistError(error);
  const record = mapDestinationRow(data);
  destinationsCache = [...destinationsCache, record];
  const event = eventsCache.find((e) => e.id === input.eventId);
  if (event) await updateEvent(input.eventId, { destinationIds: [...event.destinationIds, record.id] });
  emitChange();
  return record;
}
export async function updateDestination(id: string, patch: Partial<Pick<Destination, "name" | "flag">>): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("destinations").update(patch).eq("id", id).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapDestinationRow(data);
  destinationsCache = destinationsCache.map((d) => (d.id === id ? record : d));
  emitChange();
}
export async function deleteDestination(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const target = destinationsCache.find((d) => d.id === id);
  const { error } = await supabase.from("destinations").delete().eq("id", id);
  if (error) throw new PersistError(error);
  destinationsCache = destinationsCache.filter((d) => d.id !== id);
  universitiesCache = universitiesCache.filter((u) => u.destinationId !== id);
  if (target) {
    const event = eventsCache.find((e) => e.id === target.eventId);
    if (event) await updateEvent(target.eventId, { destinationIds: event.destinationIds.filter((x) => x !== id) });
  }
  emitChange();
}

/** The "copy from another event" convenience — deep-copies a source event's
 *  destinations and universities into fresh, independent rows owned by the target
 *  event, rather than sharing/referencing the originals. */
export async function copyDestinationsFromEvent(sourceEventId: string, targetEventId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const sourceDests = destinationsCache.filter((d) => d.eventId === sourceEventId);
  const newDestinationIds: string[] = [];
  for (const dest of sourceDests) {
    const { data: newDest, error: destErr } = await supabase
      .from("destinations")
      .insert({ id: newId("dest"), event_id: targetEventId, name: dest.name, flag: dest.flag })
      .select()
      .single();
    if (destErr || !newDest) throw new PersistError(destErr);
    const destRecord = mapDestinationRow(newDest);
    destinationsCache = [...destinationsCache, destRecord];
    newDestinationIds.push(destRecord.id);

    const sourceUnis = universitiesCache.filter((u) => u.destinationId === dest.id);
    for (const uni of sourceUnis) {
      const { data: newUni, error: uniErr } = await supabase
        .from("universities")
        .insert({ id: newId("uni"), destination_id: destRecord.id, name: uni.name, short_name: uni.shortName })
        .select()
        .single();
      if (uniErr || !newUni) throw new PersistError(uniErr);
      universitiesCache = [...universitiesCache, mapUniversityRow(newUni)];
    }
  }
  const targetEvent = eventsCache.find((e) => e.id === targetEventId);
  if (targetEvent) await updateEvent(targetEventId, { destinationIds: [...targetEvent.destinationIds, ...newDestinationIds] });
  emitChange();
}

// ---- auth / session ----

/** Shared by the no-MFA path and the post-step-up path — resolves the signed-in
 *  Supabase Auth user to its organization and bridges into the local sessionCache
 *  shape the rest of the app reads via useSession(). Only ever called once the
 *  Supabase session is actually at full strength (aal2 if the account has 2FA on). */
async function finishAdminLogin(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  user: { id: string; email?: string }
): Promise<{ success: boolean; error?: string }> {
  const { data: org } = await supabase.from("organizations").select("id, name, slug, is_suspended").eq("owner_user_id", user.id).maybeSingle();

  if (!org) {
    await supabase.auth.signOut();
    return { success: false, error: "This organization no longer exists. Contact support for help." };
  }
  if (org.is_suspended) {
    await supabase.auth.signOut();
    return { success: false, error: "This account has been suspended. Contact support for help." };
  }

  hydrateSession();
  sessionCache = {
    id: user.id,
    name: org.name || user.email || "Admin",
    email: user.email || "",
    role: "admin",
    orgSlug: org.slug ?? undefined,
  };
  persistSession();
  return { success: true };
}

/**
 * Real admin/org-owner login via Supabase Auth. On success this bridges into the same
 * local sessionCache shape the rest of the app reads via useSession(). If the account
 * has 2FA enabled, this stops short of that bridge and returns mfaRequired instead —
 * sessionCache only gets set once completeMfaLogin verifies the code, so a password-only
 * sign-in (Supabase's own aal1 session) never counts as "signed in" from this app's
 * point of view until the step-up is satisfied.
 */
export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; mfaRequired?: boolean; factorId?: string }> {
  if (!supabaseConfigured()) {
    return { success: false, error: "Sign-in isn't configured yet. Add real Supabase keys to .env.local and restart the dev server." };
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    if (error?.message.toLowerCase().includes("email not confirmed")) {
      return { success: false, error: "Please verify your email before signing in — check your inbox for the verification link." };
    }
    return { success: false, error: error?.message || "Invalid email or password." };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (factor) return { success: false, mfaRequired: true, factorId: factor.id };
  }

  return finishAdminLogin(supabase, data.user);
}

/** Completes a login that stopped at the 2FA step — verifies the code against the
 *  factor login() already identified, then runs the same session-bridge login()
 *  would have run directly if 2FA weren't enabled. */
export async function completeMfaLogin(factorId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createSupabaseBrowserClient();
  try {
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challenge) throw new Error(challengeErr?.message || "Couldn't verify that code. Please try again.");
    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
    if (verifyErr) throw new Error("Invalid code. Please try again.");
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid code. Please try again." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Session expired — please sign in again." };
  return finishAdminLogin(supabase, user);
}

/** Staff check-in — validates the access code server-side (see /api/orgs/[slug]/staff-checkin)
 *  and bridges the resulting staff row into the local device session. Always by name,
 *  never by id — the returned staff.id becomes this device's bearer session credential,
 *  so the client must never already know one going in (see public_org_staff_names). */
export async function loginAsStaff(
  orgSlug: string,
  data: { name: string; eventId: string; destinationId?: string; universityId?: string; code?: string }
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/staff-checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error || "Couldn't check you in." };

  hydrateSession();
  sessionCache = json.staff;
  persistSession();
  return { success: true };
}

/** Rep check-in — validates the access code server-side and marks the rep online. */
export async function loginAsRep(
  orgSlug: string,
  eventId: string,
  destId: string,
  uniId: string,
  code?: string
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/rep-checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, destinationId: destId, universityId: uniId, code }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, message: json.error || "Couldn't check you in." };

  hydrateSession();
  sessionCache = json.staff;
  persistSession();
  return { success: true };
}

export async function forceLogoutRep(id: string): Promise<void> {
  await fetch("/api/rep-logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffId: id }),
  });
  staffCache = staffCache.map((s) => (s.id === id ? { ...s, isOnline: false } : s));
  if (sessionCache?.id === id) {
    sessionCache = null;
  }
  persistSession();
}

export async function logout(): Promise<void> {
  hydrateSession();
  if (sessionCache?.role === "admin" && supabaseConfigured()) {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
  } else if (sessionCache?.role === "rep") {
    await fetch("/api/rep-logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: sessionCache.id }),
    });
  }
  sessionCache = null;
  destinationsCache = [];
  universitiesCache = [];
  eventsCache = [];
  staffCache = [];
  leadsCache = [];
  registrationsCache = [];
  persistSession();
}
