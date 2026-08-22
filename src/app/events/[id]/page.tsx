"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Calendar, Copy, CreditCard, Link2, Loader2, MapPin, Users, Download, Edit2, Lock, LockOpen, RefreshCw, Trash2, Video, X, Search } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import {
  PersistError,
  deleteEvent,
  duplicateEvent,
  getEventById,
  refreshData,
  updateEvent,
  useDataReady,
  useDestinations,
  useEvents,
  useLeads,
  useRegistrations,
  useStaff,
  useUniversities,
} from "@/lib/store";
import { Role } from "@/lib/types";
import { downloadCsv, eventLeadsToCsv, leadsToCsv } from "@/lib/csv";
import { formatTime } from "@/lib/utils";
import { getCaptureGate, getEventStatus, windowFromEvent } from "@/lib/capture-window";
import { getTemplate } from "@/lib/event-templates";
import { formatUSD } from "@/lib/billing";
import { EventWizard, type EventWizardData } from "@/components/event-wizard";
import { EventLeadsCard } from "@/components/event-leads-card";
import { EventAnalytics } from "@/components/event-analytics";
import { UniversitiesTab } from "@/components/universities-tab";
import { ProspectsTab } from "@/components/prospects-tab";
import { StaffRosterTab } from "@/components/staff-roster-tab";
import { RowSkeleton } from "@/components/skeleton";

const ADMIN_ONLY: Role[] = ["admin"];

type TabId = "dashboard" | "universities" | "prospects" | "leads" | "checkin-staff" | "representatives";

export default function EventDetailPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  useEvents(); // subscribe so edits refresh this view
  const dataReady = useDataReady();
  const event = getEventById(params.id);
  const leads = useLeads().filter((l) => l.eventId === params.id);
  const registrations = useRegistrations().filter((r) => r.eventId === params.id);
  const staff = useStaff();
  const destinations = useDestinations();
  const universities = useUniversities();

  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [filterDest, setFilterDest] = useState("");
  const [filterUni, setFilterUni] = useState("");
  const [imgError, setImgError] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [startingPayment, setStartingPayment] = useState(false);

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

  // Paystack redirects the browser back here after checkout with ?payment=callback —
  // verify immediately rather than waiting on the webhook (which can lag a few
  // seconds); finalizePaystackTransaction is idempotent, so whichever of the two runs
  // first does the real work and this is a harmless no-op if the webhook already fired.
  useEffect(() => {
    if (searchParams.get("payment") !== "callback") return;
    const reference = searchParams.get("reference");
    const eventId = params.id;
    if (!reference) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifyingPayment(true);
    fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`)
      .then((res) => res.json())
      .then(async (json) => {
        if (cancelled) return;
        if (json.success) {
          toast.success("Payment received — event published!");
          await refreshData();
        } else {
          setPaymentError(json.error || "Couldn't verify this payment. Please try again.");
        }
      })
      .catch(() => {
        if (!cancelled) setPaymentError("Couldn't reach the server to verify payment. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setVerifyingPayment(false);
      });
    router.replace(`/events/${eventId}`);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handlePayNow() {
    if (!event) return;
    setStartingPayment(true);
    setPaymentError("");
    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.authorizationUrl) throw new Error(json.error || "Couldn't start payment.");
      window.location.assign(json.authorizationUrl);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Couldn't start payment. Please try again.");
      setStartingPayment(false);
    }
  }

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

  async function handleCopyLink() {
    if (!event || typeof window === "undefined") return;
    const link = `${window.location.origin}/${session?.orgSlug ?? ""}/events/${event.id}/register`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast.success("Link copied");
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (!session) return null;

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

  const handleEditSubmit = async (data: EventWizardData, intent: "draft" | "publish") => {
    try {
      await updateEvent(event.id, data);
      setIsEditing(false);
      if (intent === "publish" && data.eventFormat === "physical" && event.published === false) {
        // Reuses the same initialize+redirect flow as the "Pay now" button on the
        // payment-required screen below — handlePayNow only needs event.id, which is
        // stable across this edit, so the stale `event` closure here is harmless.
        await handlePayNow();
      } else {
        toast.success(event.published === false ? "Draft saved" : "Event updated");
      }
    } catch (err) {
      throw err instanceof PersistError ? new Error(err.message) : new Error("Couldn't save your changes. Please try again.");
    }
  };

  const eventDests = destinations.filter((d) => event.destinationIds.includes(d.id));
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
    { id: "leads", label: "Leads" },
    { id: "checkin-staff", label: "Check-in Staff" },
    ...(allowRepAccess ? ([{ id: "representatives", label: "Representatives" }] as const) : []),
  ];

  // A physical event created but not yet paid for — inert everywhere else in the app
  // (staff can't check in, leads can't be captured, it's not listed for registration).
  // Blocks the normal tabbed page entirely rather than showing a half-usable event.
  if (!event.published) {
    return (
      <Shell>
        <div className="p-6 max-w-lg mx-auto">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
            <ArrowLeft size={15} />
            Back to events
          </Link>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            {verifyingPayment ? (
              <>
                <Loader2 size={32} className="animate-spin text-brand-600 mx-auto mb-4" />
                <h1 className="font-display text-xl text-slate-900 mb-1">Verifying your payment…</h1>
                <p className="text-sm text-slate-500">This only takes a moment.</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-brand-600/10 flex items-center justify-center mx-auto mb-4">
                  <CreditCard size={24} className="text-brand-600" />
                </div>
                <h1 className="font-display text-xl text-slate-900 mb-1">Payment required to publish this event</h1>
                <p className="text-sm text-slate-500 mb-1">{event.name}</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums mb-5">{formatUSD(event.priceUsd ?? 0)}</p>
                <p className="text-xs text-slate-400 mb-5">
                  This event exists as a draft — staff can&apos;t check in, leads can&apos;t be captured, and it won&apos;t appear for registration
                  until payment succeeds.
                </p>
                {paymentError && (
                  <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm text-left">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {paymentError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handlePayNow}
                  disabled={startingPayment}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  {startingPayment ? "Redirecting to Paystack…" : "Pay now"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="w-full mt-2.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Edit details
                </button>
              </>
            )}
          </div>
        </div>
        {isEditing && (
          <EventWizard mode="edit" initialEvent={event} destinations={destinations} onSubmit={handleEditSubmit} onCancel={() => setIsEditing(false)} />
        )}
      </Shell>
    );
  }

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
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mb-3 ${statusColor}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <h1 className="font-display text-2xl text-slate-900 mb-3">{event.name}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  {event.endDate && ` – ${new Date(event.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                  {event.startTime && ` • ${formatTime(event.startTime)}`}
                  {event.endTime && ` - ${formatTime(event.endTime)}`}
                </span>
                {event.eventFormat === "virtual" ? (
                  <span className="flex items-center gap-1.5">
                    <Video size={14} />
                    {event.virtualPlatform ? `${event.virtualPlatform} — ` : ""}
                    <a href={event.virtualJoinUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                      Join link
                    </a>
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
              <p className="text-slate-600 text-sm mt-3">{event.description}</p>
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0 w-full sm:w-auto">
              <div className="flex flex-wrap items-center gap-2 justify-end w-full sm:w-auto">
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
              <div className="text-right">
                <p className="text-4xl font-bold text-slate-900 tabular-nums">{leads.length}</p>
                <p className="text-xs text-slate-500">total leads</p>
              </div>
            </div>
          </div>

          {event.coverImage && !imgError && (
            <div className="mt-5 w-full h-48 rounded-xl overflow-hidden">
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
            ) : (
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
          <EventAnalytics event={event} leads={leads} registrations={registrations} destinations={destinations} universities={universities} />
        )}

        {activeTab === "universities" && (
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
        )}

        {activeTab === "prospects" && (
          <ProspectsTab event={event} registrations={registrations} leads={leads} destinations={destinations} universities={universities} staff={staff} />
        )}

        {activeTab === "checkin-staff" && (
          <StaffRosterTab
            role="staff"
            staff={staff.filter((s) => s.eventId === event.id && s.role === "staff")}
            destinations={destinations}
            universities={universities}
            orgSlug={session.orgSlug}
            eventId={event.id}
          />
        )}

        {activeTab === "representatives" && (
          <StaffRosterTab
            role="rep"
            staff={staff.filter((s) => s.eventId === event.id && s.role === "rep")}
            destinations={destinations}
            universities={universities}
            orgSlug={session.orgSlug}
            eventId={event.id}
          />
        )}

        {activeTab === "leads" && (
          <>
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
              <EventLeadsCard event={event} leads={filteredLeads} universities={universities} />
            )}

            {filteredLeads.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Users size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">No leads found</p>
                {activeFilters > 0 ? <p className="text-sm mt-1">Try adjusting your filters</p> : <p className="text-sm mt-1">Leads collected by staff will appear here</p>}
              </div>
            )}
          </>
        )}

        {isEditing && (
          <EventWizard
            mode="edit"
            initialEvent={event}
            destinations={destinations}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditing(false)}
          />
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
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
