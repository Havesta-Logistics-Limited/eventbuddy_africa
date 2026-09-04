"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Calendar, Check, Copy, Link2, MapPin, Users, Download, Edit2, Lock, LockOpen, QrCode, RefreshCw, Repeat, Trash2, Video, X, Search } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import {
  PersistError,
  deleteEvent,
  duplicateEvent,
  getAnnouncementsForEvent,
  getDiscountCodesForEvent,
  getEventById,
  getGuestsForEvent,
  getOneOnOneRequestsForEvent,
  getSessionsForEvent,
  getSpeakersForEvent,
  getTicketTypesForEvent,
  refreshData,
  resolveMyOrgId,
  updateEvent,
  useDataReady,
  useDestinations,
  useDiscountCodes,
  useEventAnnouncements,
  useEventGuests,
  useEvents,
  useEventOneOnOneRequests,
  useEventSessions,
  useEventSpeakers,
  useLeads,
  useRegistrations,
  useStaff,
  useTicketTypes,
  useUniversities,
} from "@/lib/store";
import { Role } from "@/lib/types";
import { downloadCsv, eventLeadsToCsv, leadsToCsv } from "@/lib/csv";
import { formatTime, safeHttpUrl } from "@/lib/utils";
import { getCaptureGate, getEventStatus, windowFromEvent } from "@/lib/capture-window";
import { getTemplate } from "@/lib/event-templates";
import { EventWizard, type EventWizardData } from "@/components/event-wizard";
import { EventLeadsCard } from "@/components/event-leads-card";
import { EventAnalytics } from "@/components/event-analytics";
import { UniversitiesTab } from "@/components/universities-tab";
import { DestinationsUniversitiesManagement } from "@/components/destinations-universities-management";
import { ProspectsTab } from "@/components/prospects-tab";
import { StaffRosterTab } from "@/components/staff-roster-tab";
import { RepsManagement } from "@/components/reps-management";
import { TicketsTab } from "@/components/tickets-tab";
import { ScheduleTab } from "@/components/event-schedule-tab";
import { SpeakersTab } from "@/components/event-speakers-tab";
import { OneOnOneTab } from "@/components/event-one-on-one-tab";
import { QaTab } from "@/components/event-qa-tab";
import { PollsTab } from "@/components/event-polls-tab";
import { AnnouncementsTab } from "@/components/event-announcements-tab";
import { SurveyTab } from "@/components/event-survey-tab";
import { GuestListTab } from "@/components/event-guest-list-tab";
import { EventHubQrModal } from "@/components/event-hub-qr-modal";
import { RowSkeleton } from "@/components/skeleton";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthLoading } from "@/components/auth-loading";

const ADMIN_ONLY: Role[] = ["admin"];

type TabId =
  | "dashboard"
  | "universities"
  | "prospects"
  | "tickets"
  | "leads"
  | "checkin-staff"
  | "representatives"
  | "schedule"
  | "speakers"
  | "one-on-one"
  | "qa"
  | "polls"
  | "announcements"
  | "guests"
  | "survey";

export default function EventDetailPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const allEvents = useEvents();
  const dataReady = useDataReady();
  const event = getEventById(params.id);
  const leads = useLeads().filter((l) => l.eventId === params.id);
  const registrations = useRegistrations().filter((r) => r.eventId === params.id);
  const staff = useStaff();
  const destinations = useDestinations();
  const universities = useUniversities();
  useTicketTypes(); // subscribe so ticket-type edits refresh this view
  const ticketTypes = getTicketTypesForEvent(params.id);
  useDiscountCodes(); // subscribe so discount-code edits refresh this view
  const discountCodes = getDiscountCodesForEvent(params.id);
  useEventSessions(); // subscribe so schedule edits refresh this view
  const sessions = getSessionsForEvent(params.id);
  useEventSpeakers(); // subscribe so speaker edits refresh this view
  const speakers = getSpeakersForEvent(params.id);
  useEventOneOnOneRequests(); // subscribe so 1-on-1 request edits refresh this view
  const oneOnOneRequests = getOneOnOneRequestsForEvent(params.id);
  useEventAnnouncements(); // subscribe so announcement edits refresh this view
  const announcements = getAnnouncementsForEvent(params.id);
  useEventGuests(); // subscribe so guest-list edits refresh this view
  const guests = getGuestsForEvent(params.id);
  const [hasPayoutsConfigured, setHasPayoutsConfigured] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [filterDest, setFilterDest] = useState("");
  const [filterUni, setFilterUni] = useState("");
  const [imgError, setImgError] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showHubQr, setShowHubQr] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [slugError, setSlugError] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);

  // A freshly duplicated event lands here with ?edit=1 so the admin can
  // adjust the copy (name, dates, venue) immediately instead of hunting
  // for the Edit button.
  useEffect(() => {
    if (event && searchParams.get("edit") === "1") {
      // Deliberate: syncing local UI state to a one-time URL signal from
      // navigation, not a derived-state anti-pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsEditing(true);
      router.replace(`/events/${event.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  // Registrations/leads can change from another device (a staff member checking
  // someone in, a rep or admin capturing a lead) — refetch whenever the admin looks
  // at a tab whose numbers depend on that, rather than showing whatever was cached
  // when this page first loaded.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefreshing(true);
    refreshData().finally(() => {
      if (!cancelled) setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, refreshTick]);

  // The status pill (Upcoming/Active/Completed) is computed fresh on every render from
  // the current time, but nothing else re-renders this page as time passes — a tab left
  // open past the event's end time would keep showing "Active" forever. Deliberately a
  // separate, lightweight tick from refreshTick above — this just needs a re-render, not
  // another network refetch every 30 seconds.
  const [, forceStatusTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceStatusTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Scoped to the caller's own org — see the identical fix in admin/page.tsx for
    // why an unfiltered `.limit(1)` here would leak an arbitrary organization's
    // payout-configured status to a dual-role (org owner + platform admin) account.
    resolveMyOrgId(supabase).then((orgId) => {
      if (!orgId) return;
      supabase
        .from("organizations")
        .select("paystack_subaccount_code")
        .eq("id", orgId)
        .maybeSingle()
        .then(({ data }) => setHasPayoutsConfigured(!!data?.paystack_subaccount_code));
    });
  }, []);

  async function handleDuplicate() {
    if (!event) return;
    setDuplicating(true);
    try {
      const copy = await duplicateEvent(event.id);
      if (copy) {
        toast.success("Event duplicated");
        router.push(`/events/${copy.id}?edit=1`);
      }
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't duplicate this event. Please try again.");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      toast.success("Event deleted");
      router.push("/dashboard");
    } catch (err) {
      setDeleteError(err instanceof PersistError ? err.message : "Couldn't delete this event. Please try again.");
      setDeleting(false);
    }
  }

  async function handlePublish() {
    if (!event) return;
    setPublishing(true);
    try {
      await updateEvent(event.id, { published: true });
      toast.success("Event published — it's now live");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't publish this event. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopyLink() {
    if (!event || typeof window === "undefined") return;
    // The new universal format once a slug is set (no org segment needed at all);
    // falls back to the older org-scoped form for an event with no slug.
    const link = event.slug
      ? `${window.location.origin}/discover/${event.slug}`
      : `${window.location.origin}/${session?.orgSlug ?? ""}/events/${event.id}/register`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast.success("Link copied");
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleSaveSlug() {
    if (!event) return;
    const cleaned = slugify(slugInput);
    setSavingSlug(true);
    setSlugError("");
    try {
      // `cleaned` is always a real string here (never undefined) specifically so
      // eventToRow's `!== undefined` check fires and an empty value actually nulls
      // the column out — passing undefined would make it skip the field entirely,
      // silently failing to clear a previously-set custom link.
      await updateEvent(event.id, { slug: cleaned });
      setEditingSlug(false);
      toast.success(cleaned ? "Custom link saved" : "Custom link removed");
    } catch (err) {
      const code = err instanceof PersistError && err.cause && typeof err.cause === "object" && "code" in err.cause ? (err.cause as { code?: string }).code : undefined;
      setSlugError(code === "23505" ? "This link is already taken — try another." : err instanceof PersistError ? err.message : "Couldn't save this link.");
    } finally {
      setSavingSlug(false);
    }
  }

  if (!session) return <AuthLoading />;

  if (!event) {
    if (!dataReady) {
      return (
        <Shell>
          <div className="p-6 max-w-5xl mx-auto space-y-3">
            <div className="h-4 w-28 rounded bg-slate-200 animate-pulse mb-2" />
            <div className="h-40 rounded-2xl bg-slate-200 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <div className="p-8 text-center text-slate-500">
          <p>Event not found.</p>
          <Link href="/dashboard" className="text-brand-600 mt-2 inline-block">
            ← Back to events
          </Link>
        </div>
      </Shell>
    );
  }

  const handleEditSubmit = async (data: EventWizardData) => {
    try {
      await updateEvent(event.id, data);
      setIsEditing(false);
      toast.success("Event updated");
    } catch (err) {
      throw err instanceof PersistError ? new Error(err.message) : new Error("Couldn't save your changes. Please try again.");
    }
  };

  const eventDests = destinations.filter((d) => event.destinationIds.includes(d.id));
  const eventUnis = universities.filter((u) => eventDests.some((d) => d.id === u.destinationId));
  const availableUnis = filterDest ? universities.filter((u) => u.destinationId === filterDest) : universities;

  const filteredLeads = leads.filter((l) => {
    if (filterDest && l.destinationId !== filterDest) return false;
    if (filterUni && l.universityId !== filterUni) return false;
    if (search) {
      const q = search.toLowerCase();
      const full = `${l.firstName} ${l.lastName} ${l.email} ${l.phone}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    return true;
  });

  const activeFilters = [filterDest, filterUni, search].filter(Boolean).length;
  const clearFilters = () => {
    setFilterDest("");
    setFilterUni("");
    setSearch("");
  };

  const byDestination = eventDests.map((dest) => ({
    dest,
    leads: filteredLeads.filter((l) => l.destinationId === dest.id),
  }));

  const gate = getCaptureGate(windowFromEvent(event), event.timezone, event.captureOverride);

  const status = getEventStatus(event);
  const statusColor = {
    active: "bg-emerald-100 text-emerald-700",
    upcoming: "bg-amber-100 text-amber-700",
    completed: "bg-slate-100 text-slate-500",
  }[status];

  const usesDestinations = getTemplate(event.templateId).usesDestinations;
  const allowRepAccess = usesDestinations && event.allowRepAccess !== false;
  const TABS: { id: TabId; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    ...(usesDestinations ? ([{ id: "universities", label: "Universities" }] as const) : []),
    ...(event.eventFormat !== "virtual" && event.selfRegistrationEnabled !== false ? ([{ id: "prospects", label: "Prospects" }] as const) : []),
    ...(event.eventFormat === "virtual" || event.selfRegistrationEnabled !== false ? ([{ id: "tickets", label: "Tickets" }] as const) : []),
    { id: "leads", label: "Leads" },
    { id: "checkin-staff", label: "Check-in Staff" },
    // Reps are an org-wide resource managed from here now (see RepsManagement) — the
    // tab itself only needs usesDestinations (is this an Education Fair event at
    // all), not allowRepAccess, since "this specific event doesn't let reps check
    // in" shouldn't also block managing the org's rep roster from ever being reached.
    ...(usesDestinations ? ([{ id: "representatives", label: "Representatives" }] as const) : []),
    ...(event.isInviteOnly ? ([{ id: "guests", label: "Guests" }] as const) : []),
    { id: "schedule", label: "Schedule" },
    { id: "speakers", label: "Speakers" },
    { id: "one-on-one", label: "1-on-1s" },
    { id: "qa", label: "Q&A" },
    { id: "polls", label: "Polls" },
    { id: "announcements", label: "Announcements" },
    { id: "survey", label: "Survey" },
  ];

  // Other Education Fair events this org has created, for the "copy destinations
  // from a past event" convenience — see copyDestinationsFromEvent in store.ts.
  const otherEducationFairEvents = allEvents.filter((e) => e.id !== event.id && getTemplate(e.templateId).usesDestinations).map((e) => ({ id: e.id, name: e.name }));

  return (
    <Shell>
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
          <ArrowLeft size={15} />
          Back to events
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex-1 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mb-3 ${
                  event.published === false ? "bg-slate-100 text-slate-600" : statusColor
                }`}
              >
                {event.published === false ? "Draft" : status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <h1 className="font-display text-2xl text-slate-900 mb-3">{event.name}</h1>
              {event.seriesId &&
                (() => {
                  const siblings = allEvents
                    .filter((e) => e.seriesId === event.seriesId)
                    .sort((a, b) => (a.seriesOccurrenceIndex ?? 0) - (b.seriesOccurrenceIndex ?? 0));
                  return (
                    <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                      <Repeat size={12} />
                      <span>
                        Session {event.seriesOccurrenceIndex} of {siblings.length} in this series
                      </span>
                      <select
                        value={event.id}
                        onChange={(e) => router.push(`/events/${e.target.value}`)}
                        className="px-2 py-0.5 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-600"
                      >
                        {siblings.map((s) => (
                          <option key={s.id} value={s.id}>
                            {new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                <span className="flex items-start gap-1.5">
                  <Calendar size={14} className="mt-0.5 shrink-0" />
                  <span>
                    {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    {event.endDate && ` – ${new Date(event.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                    {event.startTime && ` • ${formatTime(event.startTime)}`}
                    {event.endTime && ` - ${formatTime(event.endTime)}`}
                  </span>
                </span>
                {event.eventFormat === "virtual" ? (
                  <span className="flex items-center gap-1.5">
                    <Video size={14} />
                    {event.virtualPlatform ? `${event.virtualPlatform} — ` : ""}
                    {safeHttpUrl(event.virtualJoinUrl) ? (
                      <a href={safeHttpUrl(event.virtualJoinUrl)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        Join link
                      </a>
                    ) : (
                      <span className="text-slate-400">No join link set</span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    {event.venue}, {event.location}
                  </span>
                )}
              </div>
              {event.eventFormat === "virtual" && event.virtualAccessNotes && (
                <p className="text-xs text-slate-400 mt-1">{event.virtualAccessNotes}</p>
              )}
              {event.description && event.description.trim() !== event.name.trim() && (
                <p className="text-slate-600 text-sm mt-3 pt-3 border-t border-slate-100">{event.description}</p>
              )}
              {event.published === false && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3 w-fit">
                  <AlertCircle size={13} className="shrink-0" />
                  This event is saved as a draft — it isn&apos;t visible to attendees or open for registration until you publish it.
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0 w-full sm:w-auto">
              <div className="flex flex-wrap items-center gap-2 justify-end w-full sm:w-auto">
                {event.published === false && (
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                    style={{ background: "#C21FAF" }}
                  >
                    {publishing ? "Publishing…" : "Publish Event"}
                  </button>
                )}
                <button
                  onClick={() => setShowHubQr(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <QrCode size={14} />
                  Event Hub QR
                </button>
                <button
                  onClick={handleDuplicate}
                  disabled={duplicating}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
                >
                  <Copy size={14} />
                  {duplicating ? "Duplicating…" : "Duplicate"}
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Edit2 size={14} />
                  Edit Event
                </button>
                <button
                  onClick={() => {
                    setDeleteError("");
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
              <div className="flex items-start gap-6">
                {event.selfRegistrationEnabled !== false && (
                  <div className="text-right">
                    <p className="text-4xl font-bold text-slate-400 tabular-nums">{event.registrationPageViews ?? 0}</p>
                    <p className="text-xs text-slate-500">registration page views</p>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-4xl font-bold text-slate-900 tabular-nums">{leads.length}</p>
                  <p className="text-xs text-slate-500">total leads</p>
                </div>
              </div>
            </div>
          </div>

          {event.coverImage && !imgError && (
            <div className="mt-5 w-full aspect-video rounded-xl overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm mb-1">Lead capture</h2>
            <p className="text-xs text-slate-500">
              {gate.open ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <LockOpen size={12} /> Currently accepting leads
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                  <Lock size={12} />
                  {gate.reason === "manually_closed" ? "Closed by platform admin" : gate.reason === "not_started" ? "Not open yet" : "Closed — event ended"}
                </span>
              )}
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            {event.eventFormat === "virtual" || event.selfRegistrationEnabled !== false ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-800 text-sm mb-1">{event.eventFormat === "virtual" ? "Lead capture link" : "Attendee registration"}</h2>
                  <p className="text-xs text-slate-500">
                    {event.eventFormat === "virtual" ? (
                      "Share this so attendees can sign up — it captures them straight as a lead, no check-in needed."
                    ) : (
                      <>
                        {registrations.length} registered
                        {registrations.length > 0 && ` · ${registrations.filter((r) => r.status === "checked_in").length} checked in`}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Link2 size={12} />
                  {linkCopied ? "Link copied!" : event.eventFormat === "virtual" ? "Copy link" : "Copy registration link"}
                </button>
              </div>
            ) : null}
            {(event.eventFormat === "virtual" || event.selfRegistrationEnabled !== false) &&
              (editingSlug ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">eventbuddy.africa/discover/</span>
                    <input
                      autoFocus
                      value={slugInput}
                      onChange={(e) => setSlugInput(e.target.value)}
                      placeholder="your-event-name"
                      className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                    <button
                      type="button"
                      onClick={handleSaveSlug}
                      disabled={savingSlug}
                      className="p-1.5 rounded-lg text-emerald-600 border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50 shrink-0"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSlug(false);
                        setSlugError("");
                      }}
                      className="p-1.5 rounded-lg text-slate-500 border border-slate-200 hover:bg-slate-50 shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">Leave blank to use the default link. Letters, numbers, and dashes only.</p>
                  {slugError && <p className="text-xs text-rose-600 mt-1">{slugError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSlugInput(event.slug ?? "");
                    setEditingSlug(true);
                  }}
                  className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-brand-600"
                >
                  <Edit2 size={10} />
                  {event.slug ? "Edit custom link" : "Customize this link"}
                </button>
              ))}
            {!(event.eventFormat === "virtual" || event.selfRegistrationEnabled !== false) && (
              <div>
                <h2 className="font-semibold text-slate-800 text-sm mb-1">Attendee registration</h2>
                <p className="text-xs text-slate-500">Off for this event — no public sign-up link. Staff capture every lead directly at the booth.</p>
              </div>
            )}
          </div>

        </div>

        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-slate-200 mb-6">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`pb-3 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefreshTick((n) => n + 1)}
            disabled={refreshing}
            title="Refresh — pulls in check-ins and leads captured elsewhere"
            className="flex items-center gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-60 shrink-0"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {activeTab === "dashboard" && (
          <div key="dashboard" className="animate-tab-fade">
            <EventAnalytics event={event} leads={leads} registrations={registrations} destinations={destinations} universities={universities} />
          </div>
        )}

        {activeTab === "universities" && (
          <div key="universities" className="space-y-10 animate-tab-fade">
            <DestinationsUniversitiesManagement eventId={event.id} destinations={eventDests} universities={eventUnis} otherEvents={otherEducationFairEvents} />
            <div className="pt-8 border-t border-slate-200">
              <h2 className="font-semibold text-slate-800 mb-4">Leads by university</h2>
              <UniversitiesTab
                eventDests={eventDests}
                universities={universities}
                leads={leads}
                onSelectUniversity={(destId, uniId) => {
                  setFilterDest(destId);
                  setFilterUni(uniId);
                  setActiveTab("leads");
                }}
              />
            </div>
          </div>
        )}

        {activeTab === "prospects" && (
          <div key="prospects" className="animate-tab-fade">
            <ProspectsTab
              event={event}
              orgSlug={session.orgSlug!}
              registrations={registrations}
              leads={leads}
              destinations={destinations}
              universities={universities}
              staff={staff}
              ticketTypes={ticketTypes}
            />
          </div>
        )}

        {activeTab === "tickets" && (
          <div key="tickets" className="animate-tab-fade">
            <TicketsTab event={event} ticketTypes={ticketTypes} discountCodes={discountCodes} hasPayoutsConfigured={hasPayoutsConfigured} />
          </div>
        )}

        {activeTab === "checkin-staff" && (
          <div key="checkin-staff" className="animate-tab-fade">
            <StaffRosterTab
              role="staff"
              staff={staff.filter((s) => s.eventId === event.id && s.role === "staff")}
              destinations={destinations}
              universities={universities}
              orgSlug={session.orgSlug}
              eventId={event.id}
            />
          </div>
        )}

        {activeTab === "representatives" && (
          <div key="representatives" className="space-y-10 animate-tab-fade">
            <RepsManagement eventId={event.id} staff={staff} destinations={eventDests} universities={eventUnis} />
            <div className="pt-8 border-t border-slate-200">
              <h2 className="font-semibold text-slate-800 mb-4">Signed in for this event</h2>
              {allowRepAccess ? (
                <StaffRosterTab
                  role="rep"
                  staff={staff.filter((s) => s.eventId === event.id && s.role === "rep")}
                  destinations={destinations}
                  universities={universities}
                  orgSlug={session.orgSlug}
                  eventId={event.id}
                />
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
                  Rep check-in is off for this event — reps above can still be managed, but none can sign in here until you turn it on from Edit
                  Event.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div key="schedule" className="animate-tab-fade">
            <ScheduleTab eventId={event.id} sessions={sessions} speakers={speakers} />
          </div>
        )}

        {activeTab === "speakers" && (
          <div key="speakers" className="animate-tab-fade">
            <SpeakersTab eventId={event.id} speakers={speakers} />
          </div>
        )}

        {activeTab === "one-on-one" && (
          <div key="one-on-one" className="animate-tab-fade">
            <OneOnOneTab
              orgSlug={session?.orgSlug ?? ""}
              eventId={event.id}
              oneOnOneEnabled={event.oneOnOneEnabled ?? false}
              oneOnOneLimit={event.oneOnOneLimit}
              requests={oneOnOneRequests}
            />
          </div>
        )}

        {activeTab === "qa" && (
          <div key="qa" className="animate-tab-fade">
            <QaTab eventId={event.id} sessions={sessions} speakers={speakers} />
          </div>
        )}

        {activeTab === "polls" && (
          <div key="polls" className="animate-tab-fade">
            <PollsTab eventId={event.id} />
          </div>
        )}

        {activeTab === "announcements" && (
          <div key="announcements" className="animate-tab-fade">
            <AnnouncementsTab eventId={event.id} orgSlug={session.orgSlug!} announcements={announcements} />
          </div>
        )}

        {activeTab === "guests" && (
          <div key="guests" className="animate-tab-fade">
            <GuestListTab eventId={event.id} orgSlug={session.orgSlug!} guests={guests} />
          </div>
        )}

        {activeTab === "survey" && (
          <div key="survey" className="animate-tab-fade">
            <SurveyTab event={event} />
          </div>
        )}

        {activeTab === "leads" && (
          <div key="leads" className="animate-tab-fade">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-sm text-slate-500">
                {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}
              </p>
              <button
                onClick={() => {
                  downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_all_leads.csv`, eventLeadsToCsv(filteredLeads, event));
                  toast.success("Leads exported");
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 transition-[transform,background-color] active:scale-[0.97]"
              >
                <Download size={12} />
                Export All Leads
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 mb-5">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search leads..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <select
                  value={filterDest}
                  onChange={(e) => {
                    setFilterDest(e.target.value);
                    setFilterUni("");
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                >
                  <option value="">All Destinations</option>
                  {eventDests.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.flag} {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filterUni}
                  onChange={(e) => setFilterUni(e.target.value)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white min-w-[160px]"
                >
                  <option value="">All Universities</option>
                  {availableUnis.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.shortName}
                    </option>
                  ))}
                </select>
                {activeFilters > 0 && (
                  <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 border border-rose-100">
                    <X size={13} />
                    Clear ({activeFilters})
                  </button>
                )}
              </div>
            </div>

            {byDestination.map(({ dest, leads: dLeads }) => {
              if (dLeads.length === 0) return null;
              return (
                <div key={dest.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{dest.flag}</span>
                      <div>
                        <h2 className="font-semibold text-slate-900">{dest.name}</h2>
                        <p className="text-xs text-slate-500">
                          {dLeads.length} lead{dLeads.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        downloadCsv(`${dest.name.replace(/\s+/g, "_")}_leads.csv`, leadsToCsv(dLeads));
                        toast.success("Leads exported");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <Download size={12} />
                      Export
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {["Name", "Email", "Phone", "University", "Course", "Level", "Start", "IELTS"].map((h) => (
                            <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {lead.firstName} {lead.lastName}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{lead.email}</td>
                            <td className="px-4 py-3 text-slate-500">{lead.phone}</td>
                            <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                              {universities.find((u) => u.id === lead.universityId)?.shortName}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{lead.preferredCourse}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "#e8f0fe", color: "#1a3a6e" }}>
                                {lead.levelOfInterest}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{lead.startYear}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                  lead.takenIELTS === "Yes" ? "bg-emerald-100 text-emerald-700" : lead.takenIELTS === "Registered" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {lead.takenIELTS}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {eventDests.length === 0 && filteredLeads.length > 0 && (
              <EventLeadsCard event={event} leads={filteredLeads} universities={universities} orgSlug={session.orgSlug} />
            )}

            {filteredLeads.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Users size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">No leads found</p>
                {activeFilters > 0 ? <p className="text-sm mt-1">Try adjusting your filters</p> : <p className="text-sm mt-1">Leads collected by staff will appear here</p>}
              </div>
            )}
          </div>
        )}

        {isEditing && (
          <EventWizard mode="edit" initialEvent={event} onSubmit={handleEditSubmit} onCancel={() => setIsEditing(false)} />
        )}

        {showHubQr && typeof window !== "undefined" && (
          <EventHubQrModal
            eventName={event.name}
            hubUrl={`${window.location.origin}/${session.orgSlug}/events/${event.id}/hub`}
            onClose={() => setShowHubQr(false)}
          />
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
            <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-sm shadow-2xl p-6">
              <h2 className="font-semibold text-slate-900 text-lg mb-2">Delete this event?</h2>
              <p className="text-sm text-slate-600">
                This permanently deletes <span className="font-semibold">{event.name}</span>
                {leads.length > 0 && (
                  <>
                    {" "}
                    and its <span className="font-semibold">{leads.length} collected lead{leads.length !== 1 ? "s" : ""}</span>
                  </>
                )}
                . This can&apos;t be undone.
              </p>
              {deleteError && (
                <div className="flex items-start gap-2 p-3 mt-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {deleteError}
                </div>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete Event"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
