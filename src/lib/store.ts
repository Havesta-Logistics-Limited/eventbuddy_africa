"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Destination, DiscountCode, DiscountRedemption, EventRecord, FieldDef, LeadRecord, RegistrationRecord, Session, StaffRecord, TicketType, University } from "./types";
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
  published: boolean | null;
  price_naira: number | null;
  template_id: string | null;
  custom_fields: FieldDef[] | null;
  timezone: string | null;
  capture_override: "open" | "closed" | null;
  event_format: string | null;
  virtual_join_url: string | null;
  virtual_platform: string | null;
  virtual_access_notes: string | null;
  created_at: string;
}): EventRecord {
  return {
    id: e.id,
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
    published: e.published ?? true,
    priceNaira: e.price_naira !== null && e.price_naira !== undefined ? Number(e.price_naira) : undefined,
    templateId: e.template_id ?? "education-fair",
    customFields: e.custom_fields ?? [],
    timezone: e.timezone ?? undefined,
    captureOverride: e.capture_override ?? null,
    eventFormat: (e.event_format as EventRecord["eventFormat"]) ?? "physical",
    virtualJoinUrl: e.virtual_join_url ?? undefined,
    virtualPlatform: e.virtual_platform ?? undefined,
    virtualAccessNotes: e.virtual_access_notes ?? undefined,
    createdAt: e.created_at,
  };
}
function eventToRow(input: Partial<Omit<EventRecord, "id" | "createdAt">>) {
  const row: Record<string, unknown> = {};
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
  if (input.published !== undefined) row.published = input.published;
  if (input.templateId !== undefined) row.template_id = input.templateId;
  if (input.customFields !== undefined) row.custom_fields = input.customFields;
  if (input.timezone !== undefined) row.timezone = input.timezone;
  if (input.captureOverride !== undefined) row.capture_override = input.captureOverride;
  if (input.eventFormat !== undefined) row.event_format = input.eventFormat;
  if (input.virtualJoinUrl !== undefined) row.virtual_join_url = input.virtualJoinUrl || null;
  if (input.virtualPlatform !== undefined) row.virtual_platform = input.virtualPlatform || null;
  if (input.virtualAccessNotes !== undefined) row.virtual_access_notes = input.virtualAccessNotes || null;
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

// ---- org-scoped data fetch (admin via RLS-protected browser client, staff/rep via API) ----

let orgDataFetched = false;
let orgDataFetching = false;

async function fetchAdminData() {
  if (!supabaseConfigured()) return;
  orgDataFetching = true;
  try {
    const supabase = createSupabaseBrowserClient();
    const [destRes, uniRes, eventRes, staffRes, leadRes, registrationRes, ticketTypeRes, discountCodeRes] = await Promise.all([
      supabase.from("destinations").select("*"),
      supabase.from("universities").select("*"),
      supabase.from("events").select("*"),
      supabase.from("staff").select("*"),
      supabase.from("leads").select("*"),
      supabase.from("registrations").select("*"),
      supabase.from("ticket_types").select("*"),
      supabase.from("discount_codes").select("*"),
    ]);
    destinationsCache = (destRes.data ?? []).map(mapDestinationRow);
    universitiesCache = (uniRes.data ?? []).map(mapUniversityRow);
    eventsCache = (eventRes.data ?? []).map(mapEventRow);
    staffCache = (staffRes.data ?? []).map(mapStaffRow);
    leadsCache = (leadRes.data ?? []).map(mapLeadRow);
    registrationsCache = (registrationRes.data ?? []).map(mapRegistrationRow);
    ticketTypesCache = (ticketTypeRes.data ?? []).map(mapTicketTypeRow);
    discountCodesCache = (discountCodeRes.data ?? []).map(mapDiscountCodeRow);
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
    const res = await fetch(`/api/session-data?staffId=${encodeURIComponent(sessionCache.id)}`);
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
export function getLeadsFiltered(eventId?: string, destId?: string, uniId?: string): LeadRecord[] {
  return leadsCache.filter((l) => {
    if (eventId && l.eventId !== eventId) return false;
    if (destId && l.destinationId !== destId) return false;
    if (uniId && l.universityId !== uniId) return false;
    return true;
  });
}

// ---- event CRUD (admin only — browser client, RLS + auto-filled organization_id) ----

export async function addEvent(input: Omit<EventRecord, "id" | "createdAt">): Promise<EventRecord> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("events").insert(eventToRow(input)).select().single();
  if (error || !data) throw new PersistError(error);
  const record = mapEventRow(data);
  eventsCache = [...eventsCache, record];
  emitChange();
  return record;
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
  return addEvent({ ...source, name: `${source.name} (Copy)`, published: true });
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

/** On-demand, not cached like the rest of this file — a code's redemption history
 *  is only ever looked at when an admin explicitly opens it, so there's no reason to
 *  keep every org's full transaction history in memory alongside everything else.
 *  Reads paystack_transactions directly (RLS already scopes it to the caller's own
 *  org — see paystack_transactions_select_own_org) rather than a separate table,
 *  since "who used this code" is just its own successful transactions. */
export async function getDiscountCodeRedemptions(discountCodeId: string): Promise<DiscountRedemption[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("paystack_transactions")
    .select("amount_naira, verified_at, created_at, registrant_data")
    .eq("discount_code_id", discountCodeId)
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

/**
 * Real admin/org-owner login via Supabase Auth. On success this bridges into the same
 * local sessionCache shape the rest of the app reads via useSession().
 */
export async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
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

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, is_suspended")
    .eq("owner_user_id", data.user.id)
    .maybeSingle();

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
    id: data.user.id,
    name: org.name || data.user.email || "Admin",
    email: data.user.email || email,
    role: "admin",
    orgSlug: org.slug ?? undefined,
  };
  persistSession();
  return { success: true };
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
