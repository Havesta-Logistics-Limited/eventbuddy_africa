"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  Users2,
  DollarSign,
  Ticket,
  Ban,
  RotateCcw,
  LogOut,
  ShieldOff,
  ShieldCheck,
  Copy,
  Check,
  UserPlus,
  KeyRound,
  Trash2,
  AlertCircle,
  Search,
  Menu,
  X,
  Presentation,
  MapPin,
  RefreshCw,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";
import { Reveal } from "@/components/reveal";
import { RowSkeleton, StatTileSkeleton } from "@/components/skeleton";
import { Logo } from "@/components/logo";
import { downloadCsv } from "@/lib/csv";
import { EVENT_PRICE_USD, formatUSD, isBillable as isFormatBillable, eventPrice as priceForFormat, updateEventPrice } from "@/lib/billing";
import { getTemplate } from "@/lib/event-templates";

const SIDEBAR_BG = "#2e0a30";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const NAV = [
  { id: "organizations", label: "Organizations", icon: Building2 },
  { id: "events", label: "Events", icon: Calendar },
  { id: "billing", label: "Billing", icon: DollarSign },
  { id: "admins", label: "Team", icon: ShieldCheck },
] as const;
type ViewId = (typeof NAV)[number]["id"];

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  is_suspended: boolean;
  is_fee_exempt: boolean;
  is_verified: boolean;
  phone: string | null;
  email: string | null;
};
type EventRow = {
  id: string;
  organization_id: string;
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  template_id: string | null;
  event_format: "physical" | "virtual";
  payment_status: string;
  price_usd: number;
  capture_override: "open" | "closed" | null;
  created_at: string;
};
type LeadRow = { id: string; organization_id: string; event_id: string };
type RegistrationRow = { id: string; organization_id: string; event_id: string; status: string; created_at: string };
type AdminRow = { user_id: string; email: string | null; created_at: string };

function isBillable(ev: Pick<EventRow, "event_format">) {
  return isFormatBillable(ev.event_format);
}
/** The price actually snapshotted on this event at creation time (events_set_price_usd
 *  trigger) — not the platform's current price, which may have changed since. Falls
 *  back to the format-based constant only for rows fetched before price_usd existed. */
function eventPrice(ev: Pick<EventRow, "event_format" | "price_usd">) {
  return ev.price_usd ?? priceForFormat(ev.event_format);
}

export default function PlatformDashboard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const [view, setView] = useState<ViewId>("organizations");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatusFilter, setOrgStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [eventSearch, setEventSearch] = useState("");
  const [eventFormatFilter, setEventFormatFilter] = useState<"all" | "physical" | "virtual">("all");

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [orgPendingDelete, setOrgPendingDelete] = useState<OrgRow | null>(null);
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [now] = useState(() => Date.now());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [addAdminError, setAddAdminError] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);

  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState("");
  const [createAccountSuccess, setCreateAccountSuccess] = useState("");

  const [currentPrice, setCurrentPrice] = useState(EVENT_PRICE_USD);
  const [priceDraft, setPriceDraft] = useState("");
  const [editingPrice, setEditingPrice] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [busyPaymentEventId, setBusyPaymentEventId] = useState<string | null>(null);

  /** Runs both the initial load and manual/focus refreshes. Surfaces the first query
   *  error instead of silently falling back to empty lists — a missing migration
   *  (e.g. a column a query selects not existing yet) previously failed every query
   *  silently, showing "no organizations yet" even when the data was fine. */
  async function fetchPlatformData() {
    const supabase = createClient();
    const [orgsRes, eventsRes, leadsRes, registrationsRes, adminsRes, settingsRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug, created_at, is_suspended, is_fee_exempt, is_verified, phone, email")
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select(
          "id, organization_id, name, date, end_date, start_time, end_time, timezone, template_id, event_format, payment_status, price_usd, capture_override, created_at"
        ),
      supabase.from("leads").select("id, organization_id, event_id"),
      supabase.from("registrations").select("id, organization_id, event_id, status, created_at"),
      supabase.from("platform_admins").select("user_id, email, created_at").order("created_at", { ascending: true }),
      supabase.from("platform_settings").select("event_price_usd").eq("id", true).maybeSingle(),
    ]);
    const firstError = orgsRes.error || eventsRes.error || leadsRes.error || registrationsRes.error || adminsRes.error;
    setLoadError(firstError ? firstError.message : "");
    setOrgs((orgsRes.data as OrgRow[]) ?? []);
    setEvents((eventsRes.data as EventRow[]) ?? []);
    setLeads((leadsRes.data as LeadRow[]) ?? []);
    setRegistrations((registrationsRes.data as RegistrationRow[]) ?? []);
    setAdmins((adminsRes.data as AdminRow[]) ?? []);
    if (settingsRes.data) setCurrentPrice(Number(settingsRes.data.event_price_usd));
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchPlatformData();
    setRefreshing(false);
  }

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/platform/login");
        return;
      }
      const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!membership) {
        setChecking(false);
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      setChecking(false);
      setCurrentUserId(user.id);
      setCurrentUserEmail(user.email ?? "");

      await fetchPlatformData();
      setLoadingData(false);
    })();
  }, [router]);

  // Refetch when the tab regains focus, so orgs signing up (or being deleted)
  // elsewhere show up without a full reload — same reasoning as store.ts's
  // useRevalidateOnFocus for the org-level dashboard.
  useEffect(() => {
    if (!authorized) return;
    function onFocus() {
      fetchPlatformData();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [authorized]);

  // Each event row's Live/Upcoming/Closed pill is computed fresh on every render from
  // the current time, but nothing otherwise re-renders this page as time passes — so a
  // tab left open past an event's end time would keep showing "Live" forever with no
  // data ever having changed. Same fix as /checkin and /collect's forceTick.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!authorized) return;
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [authorized]);

  async function toggleSuspend(org: OrgRow) {
    setBusyOrgId(org.id);
    const supabase = createClient();
    const { error } = await supabase.from("organizations").update({ is_suspended: !org.is_suspended }).eq("id", org.id);
    if (!error) {
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_suspended: !o.is_suspended } : o)));
      toast.success(org.is_suspended ? `${org.name} reactivated` : `${org.name} suspended`);
    } else {
      toast.error(error.message);
    }
    setBusyOrgId(null);
  }

  async function toggleFeeExempt(org: OrgRow) {
    setBusyOrgId(org.id);
    const supabase = createClient();
    const { error } = await supabase.from("organizations").update({ is_fee_exempt: !org.is_fee_exempt }).eq("id", org.id);
    if (!error) {
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_fee_exempt: !o.is_fee_exempt } : o)));
      toast.success(org.is_fee_exempt ? `${org.name} — fee exemption removed` : `${org.name} exempted from fees`);
    } else {
      toast.error(error.message);
    }
    setBusyOrgId(null);
  }

  // Manual, until real payment collection (Paystack) is wired up — lets the platform
  // admin actually record which billable events have been paid, so the Billing tab's
  // revenue figures mean something today rather than sitting at "pending" forever.
  async function toggleEventPaid(ev: EventRow) {
    const nextStatus = ev.payment_status === "paid" ? "pending" : "paid";
    setBusyPaymentEventId(ev.id);
    const supabase = createClient();
    const { error } = await supabase.from("events").update({ payment_status: nextStatus }).eq("id", ev.id);
    if (!error) {
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, payment_status: nextStatus } : e)));
      toast.success(nextStatus === "paid" ? `${ev.name} marked paid` : `${ev.name} marked pending`);
    } else {
      toast.error(error.message);
    }
    setBusyPaymentEventId(null);
  }

  async function savePrice() {
    const parsed = Number(priceDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceError("Enter a valid, non-negative price.");
      return;
    }
    setPriceError("");
    setSavingPrice(true);
    try {
      await updateEventPrice(parsed);
      setCurrentPrice(parsed);
      setEditingPrice(false);
      toast.success(`Per-event price updated to ${formatUSD(parsed)}`);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "Couldn't save the new price.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function confirmDeleteOrg() {
    if (!orgPendingDelete) return;
    const org = orgPendingDelete;
    setDeletingOrgId(org.id);
    setDeleteError("");
    try {
      const res = await fetch("/api/platform/delete-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Couldn't delete that organization.");
        setDeletingOrgId(null);
        return;
      }
    } catch {
      setDeleteError("Couldn't reach the server. Check your connection and try again.");
      setDeletingOrgId(null);
      return;
    }
    setOrgs((prev) => prev.filter((o) => o.id !== org.id));
    setEvents((prev) => prev.filter((e) => e.organization_id !== org.id));
    setLeads((prev) => prev.filter((l) => l.organization_id !== org.id));
    setRegistrations((prev) => prev.filter((r) => r.organization_id !== org.id));
    setDeletingOrgId(null);
    setOrgPendingDelete(null);
    toast.success(`${org.name} deleted`);
  }

  async function setEventCaptureOverride(event: EventRow, value: "open" | "closed" | null) {
    setBusyEventId(event.id);
    const supabase = createClient();
    const { error } = await supabase.from("events").update({ capture_override: value }).eq("id", event.id);
    if (!error) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, capture_override: value } : e)));
      toast.success(`Capture set to ${value === "open" ? "Open" : value === "closed" ? "Closed" : "Auto"} for ${event.name}`);
    } else {
      toast.error(error.message);
    }
    setBusyEventId(null);
  }

  function csvEscape(value: unknown): string {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }
  function csvFrom(headers: string[], rows: unknown[][]): string {
    return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  }
  function safeFilenamePart(s: string): string {
    return s.replace(/[^a-z0-9]/gi, "_");
  }

  /** Platform dashboard only keeps thin summary rows in memory (id/org/event, for
   *  counting) — full lead/registration data is fetched on demand here, scoped to one
   *  event at a time, rather than loading every field ever collected platform-wide
   *  up front. */
  async function exportEventLeads(ev: EventRow) {
    setExportError("");
    setExportingEventId(ev.id);
    const supabase = createClient();
    const { data, error } = await supabase.from("leads").select("*").eq("event_id", ev.id).order("created_at", { ascending: true });
    setExportingEventId(null);
    if (error) {
      setExportError(error.message);
      return;
    }
    const org = orgById.get(ev.organization_id);
    const csv = csvFrom(
      ["First Name", "Middle Name", "Last Name", "Email", "Phone", "Preferred Course", "Level of Interest", "Start Year", "Highest Education", "Taken IELTS", "Comments", "Custom Answers", "Date"],
      (data ?? []).map((l) => [
        l.first_name,
        l.middle_name ?? "",
        l.last_name,
        l.email,
        l.phone,
        l.preferred_course,
        l.level_of_interest,
        l.start_year,
        l.highest_education,
        l.taken_ielts,
        l.comments,
        JSON.stringify(l.custom_answers ?? {}),
        new Date(l.created_at).toLocaleDateString("en-GB"),
      ])
    );
    downloadCsv(`${safeFilenamePart(org?.name ?? "org")}_${safeFilenamePart(ev.name)}_leads.csv`, csv);
    toast.success(`${data?.length ?? 0} lead${(data?.length ?? 0) === 1 ? "" : "s"} exported`);
  }

  async function exportEventRegistrations(ev: EventRow) {
    setExportError("");
    setExportingEventId(ev.id);
    const supabase = createClient();
    const { data, error } = await supabase.from("registrations").select("*").eq("event_id", ev.id).order("created_at", { ascending: true });
    setExportingEventId(null);
    if (error) {
      setExportError(error.message);
      return;
    }
    const org = orgById.get(ev.organization_id);
    const csv = csvFrom(
      ["Reference ID", "Name", "Email", "Phone", "Status", "Checked In", "Custom Answers", "Registered"],
      (data ?? []).map((r) => [
        r.reference_id,
        r.full_name,
        r.email,
        r.phone ?? "",
        r.status,
        r.checked_in_at ? new Date(r.checked_in_at).toLocaleString("en-GB") : "",
        JSON.stringify(r.custom_answers ?? {}),
        new Date(r.created_at).toLocaleDateString("en-GB"),
      ])
    );
    downloadCsv(`${safeFilenamePart(org?.name ?? "org")}_${safeFilenamePart(ev.name)}_registrations.csv`, csv);
    toast.success(`${data?.length ?? 0} registration${(data?.length ?? 0) === 1 ? "" : "s"} exported`);
  }

  function copyOrgId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      toast.success("Organization ID copied");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/platform/login");
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAddAdminError("");
    const email = newAdminEmail.trim();
    if (!email) return;
    setAddingAdmin(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("add_platform_admin", { target_email: email }).single();
    setAddingAdmin(false);
    if (error) {
      setAddAdminError(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    const added = data as { user_id: string; email: string } | null;
    if (added) {
      setAdmins((prev) =>
        prev.some((a) => a.user_id === added.user_id)
          ? prev
          : [...prev, { user_id: added.user_id, email: added.email, created_at: new Date().toISOString() }]
      );
      toast.success(`${added.email} granted platform access`);
    }
    setNewAdminEmail("");
  }

  async function handleRemoveAdmin(admin: AdminRow) {
    setRemovingAdminId(admin.user_id);
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_platform_admin", { target_user_id: admin.user_id });
    if (!error) {
      setAdmins((prev) => prev.filter((a) => a.user_id !== admin.user_id));
      toast.success(`${admin.email ?? "Admin"} removed`);
    } else {
      setAddAdminError(error.message.replace(/^.*?:\s*/, ""));
      toast.error(error.message.replace(/^.*?:\s*/, ""));
    }
    setRemovingAdminId(null);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreateAccountError("");
    setCreateAccountSuccess("");
    setCreatingAccount(true);
    try {
      const res = await fetch("/api/platform/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newAccountEmail.trim(), password: newAccountPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateAccountError(data.error || "Couldn't create that account.");
        return;
      }
      setAdmins((prev) =>
        prev.some((a) => a.user_id === data.userId) ? prev : [...prev, { user_id: data.userId, email: data.email, created_at: new Date().toISOString() }]
      );
      setCreateAccountSuccess(`Account created for ${data.email}.`);
      toast.success(`Account created for ${data.email}`);
      setNewAccountEmail("");
      setNewAccountPassword("");
    } catch {
      setCreateAccountError("Couldn't reach the server. Check your connection and try again.");
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setCreatingAccount(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: SIDEBAR_BG }}>
        <Logo tone="white" height={32} className="opacity-70 animate-pulse" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: SIDEBAR_BG }}>
        <div className="text-center max-w-sm">
          <Logo tone="white" height={32} className="mx-auto mb-6 opacity-90" />
          <p className="font-display text-xl text-white mb-2">Not authorized</p>
          <p className="text-sm text-white/40 mb-6">This account doesn&apos;t have platform admin access.</p>
          <button type="button" onClick={handleSignOut} className="text-sm font-medium text-fuchsia-300 hover:underline">
            Sign out and try a different account
          </button>
        </div>
      </div>
    );
  }

  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const activeRegistrations = registrations.filter((r) => r.status !== "cancelled");
  const billableEvents = events.filter(isBillable);
  // Fee-exempt orgs never owe money, regardless of how an individual event's
  // payment_status happens to be set — exclude them from every revenue figure below.
  const chargeableBillableEvents = billableEvents.filter((e) => !orgById.get(e.organization_id)?.is_fee_exempt);
  const paidBillableEvents = chargeableBillableEvents.filter((e) => e.payment_status === "paid");
  const pendingBillableEvents = chargeableBillableEvents.filter((e) => e.payment_status !== "paid");
  const exemptBillableEvents = billableEvents.filter((e) => orgById.get(e.organization_id)?.is_fee_exempt);
  const revenue = paidBillableEvents.reduce((sum, e) => sum + eventPrice(e), 0);
  const pendingRevenue = pendingBillableEvents.reduce((sum, e) => sum + eventPrice(e), 0);
  const exemptedRevenue = exemptBillableEvents.reduce((sum, e) => sum + eventPrice(e), 0);
  const revenueThisWeek = paidBillableEvents.filter((e) => now - new Date(e.created_at).getTime() < WEEK_MS).reduce((sum, e) => sum + eventPrice(e), 0);

  const revenueByOrg = Array.from(
    paidBillableEvents.reduce((map, e) => {
      map.set(e.organization_id, (map.get(e.organization_id) ?? 0) + eventPrice(e));
      return map;
    }, new Map<string, number>())
  )
    .map(([orgId, total]) => ({ org: orgById.get(orgId), total }))
    .filter((r) => r.org)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const revenueByMonth = Array.from(
    paidBillableEvents
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .reduce((map, e) => {
        const key = new Date(e.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        map.set(key, (map.get(key) ?? 0) + eventPrice(e));
        return map;
      }, new Map<string, number>())
  ).map(([month, total]) => ({ month, total }));

  const newOrgsThisWeek = orgs.filter((o) => now - new Date(o.created_at).getTime() < WEEK_MS).length;
  const newEventsThisWeek = events.filter((e) => now - new Date(e.created_at).getTime() < WEEK_MS).length;
  const newRegistrationsThisWeek = activeRegistrations.filter((r) => now - new Date(r.created_at).getTime() < WEEK_MS).length;

  const stats = [
    { label: "Organizations", value: orgs.length, icon: Building2, delta: newOrgsThisWeek > 0 ? `+${newOrgsThisWeek} this week` : null },
    { label: "Total Events", value: events.length, icon: Calendar, delta: newEventsThisWeek > 0 ? `+${newEventsThisWeek} this week` : null },
    {
      label: "Registrations",
      value: activeRegistrations.length,
      icon: Ticket,
      delta: newRegistrationsThisWeek > 0 ? `+${newRegistrationsThisWeek} this week` : null,
    },
    { label: "Total Leads", value: leads.length, icon: Users2, delta: null },
    { label: "Revenue to date", value: formatUSD(revenue), icon: DollarSign, delta: null },
  ];

  const filteredOrgs = orgs.filter((org) => {
    if (orgStatusFilter === "active" && org.is_suspended) return false;
    if (orgStatusFilter === "suspended" && !org.is_suspended) return false;
    const q = orgSearch.trim().toLowerCase();
    if (!q) return true;
    return org.name.toLowerCase().includes(q) || (org.slug ?? "").toLowerCase().includes(q);
  });

  const filteredEvents = events
    .filter((ev) => {
      if (eventFormatFilter !== "all" && ev.event_format !== eventFormatFilter) return false;
      const q = eventSearch.trim().toLowerCase();
      if (!q) return true;
      const org = orgById.get(ev.organization_id);
      return ev.name.toLowerCase().includes(q) || (org?.name.toLowerCase().includes(q) ?? false);
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  function goToOrg(orgName: string) {
    setView("organizations");
    setOrgSearch(orgName);
  }

  const sidebarNav = (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              setView(id);
              setMobileNavOpen(false);
            }}
            style={active ? { background: "color-mix(in srgb, var(--color-brand-600) 20%, transparent)" } : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              active ? "text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/8"
            }`}
          >
            <Icon size={17} className={active ? "text-fuchsia-300" : undefined} />
            {label}
          </button>
        );
      })}
    </nav>
  );

  const sidebarFooter = (
    <div className="px-3 pb-5 border-t border-white/10 pt-4">
      <div className="flex items-center gap-3 px-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-fuchsia-300/15 flex items-center justify-center text-fuchsia-300 font-semibold text-sm shrink-0">
          {currentUserEmail.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{currentUserEmail || "Platform admin"}</p>
          <p className="text-xs text-white/40">Platform admin</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/8 transition-colors"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 flex-col text-white fixed inset-y-0 left-0 z-40" style={{ background: SIDEBAR_BG }}>
        <div className="px-6 py-5 border-b border-white/10">
          <Logo tone="white" height={26} />
          <p className="text-[11px] text-white/50 leading-tight mt-1.5 flex items-center gap-1.5">
            <ShieldCheck size={11} />
            Platform Admin
          </p>
        </div>
        {sidebarNav}
        {sidebarFooter}
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 text-white h-14 flex items-center px-4 gap-4" style={{ background: SIDEBAR_BG }}>
        <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <Logo tone="white" height={20} />
      </header>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 text-white flex flex-col h-full" style={{ background: SIDEBAR_BG }}>
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <Logo tone="white" height={22} />
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                <X size={20} className="text-white/60" />
              </button>
            </div>
            {sidebarNav}
            {sidebarFooter}
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 md:ml-64 min-h-screen pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {loadError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-6">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Couldn&apos;t load some data.</p>
                <p className="text-rose-600">{loadError}</p>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-rose-200 hover:bg-rose-100 disabled:opacity-50 shrink-0"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : undefined} />
                Retry
              </button>
            </div>
          )}
          {view === "organizations" && (
            <>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl text-slate-900">Organizations</h1>
                  <p className="text-slate-500 text-sm mt-0.5">Every business using eventbuddy, and how they&apos;re doing.</p>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh"
                  aria-label="Refresh"
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {loadingData
                  ? Array.from({ length: 5 }).map((_, i) => <StatTileSkeleton key={i} />)
                  : stats.map((s, i) => (
                      <Reveal key={s.label} index={i}>
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#f5edf6" }}>
                              <s.icon size={16} style={{ color: "#610064" }} />
                            </div>
                            {s.delta && (
                              <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full">{s.delta}</span>
                            )}
                          </div>
                          <p className="text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                        </div>
                      </Reveal>
                    ))}
              </div>
              {paidBillableEvents.length === 0 && (
                <p className="text-xs text-slate-400 mb-6 -mt-2">
                  Revenue reflects paid, physical events only — billing isn&apos;t wired up yet, so this will start moving once it is. Virtual events
                  are always free.
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                    placeholder="Search organizations…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-0.5 bg-white rounded-lg border border-slate-200 p-1 shrink-0">
                  {(["all", "active", "suspended"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOrgStatusFilter(f)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                        orgStatusFilter === f ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {loadingData ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <RowSkeleton key={i} />
                  ))}
                </div>
              ) : orgs.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Building2 size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No organizations yet</p>
                </div>
              ) : filteredOrgs.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Search size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No organizations match your search.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Organization</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Contact</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Events</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Regs</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Leads</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Billing</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Status</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Joined</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrgs.map((org) => {
                          const orgEvents = events.filter((e) => e.organization_id === org.id);
                          const orgLeads = leads.filter((l) => l.organization_id === org.id);
                          const orgRegs = activeRegistrations.filter((r) => r.organization_id === org.id);
                          const orgBilling = orgEvents.reduce((sum, e) => sum + eventPrice(e), 0);
                          return (
                            <tr key={org.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 max-w-[200px]">
                                <p className="font-medium text-slate-900 truncate">{org.name}</p>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => copyOrgId(org.id)}
                                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 font-mono"
                                  title="Copy full organization ID"
                                >
                                  {copiedId === org.id ? <Check size={10} className="text-teal-600" /> : <Copy size={10} />}/{org.slug}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px]">
                                {org.email && <p className="truncate">{org.email}</p>}
                                {org.phone && <p className="text-slate-400 whitespace-nowrap">{org.phone}</p>}
                                {!org.email && !org.phone && <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-600 tabular-nums">{orgEvents.length}</td>
                              <td className="px-4 py-3 text-slate-600 tabular-nums">{orgRegs.length}</td>
                              <td className="px-4 py-3 text-slate-600 tabular-nums">{orgLeads.length}</td>
                              <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                                {formatUSD(orgBilling)}
                                {org.is_fee_exempt && <span className="block text-[10px] text-teal-600 font-medium">exempt</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  <span
                                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${
                                      org.is_suspended ? "text-rose-700 bg-rose-100" : "text-teal-700 bg-teal-100"
                                    }`}
                                  >
                                    {org.is_suspended ? "Suspended" : "Active"}
                                  </span>
                                  <span
                                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${
                                      org.is_verified ? "text-brand-700 bg-brand-100" : "text-amber-700 bg-amber-100"
                                    }`}
                                    title={org.is_verified ? "Owner has verified their email" : "Owner hasn't verified their email yet"}
                                  >
                                    {org.is_verified ? "Verified" : "Unverified"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                {new Date(org.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleFeeExempt(org)}
                                    disabled={busyOrgId === org.id}
                                    title={org.is_fee_exempt ? "Remove fee exemption" : "Exempt from per-event fee"}
                                    aria-label={org.is_fee_exempt ? "Remove fee exemption" : "Exempt from per-event fee"}
                                    className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${
                                      org.is_fee_exempt ? "border-teal-200 text-teal-700 hover:bg-teal-50" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                    }`}
                                  >
                                    {org.is_fee_exempt ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleSuspend(org)}
                                    disabled={busyOrgId === org.id}
                                    title={org.is_suspended ? "Reactivate" : "Suspend"}
                                    aria-label={org.is_suspended ? "Reactivate" : "Suspend"}
                                    className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${
                                      org.is_suspended ? "border-teal-200 text-teal-700 hover:bg-teal-50" : "border-rose-200 text-rose-500 hover:bg-rose-50"
                                    }`}
                                  >
                                    {org.is_suspended ? <RotateCcw size={14} /> : <Ban size={14} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteError("");
                                      setOrgPendingDelete(org);
                                    }}
                                    title="Delete organization"
                                    aria-label="Delete organization"
                                    className="p-2 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "events" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl text-slate-900">Events</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  Every event across every organization. Physical events are billable at {formatUSD(currentPrice)}; virtual events are always free.
                </p>
              </div>

              {exportError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-4">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {exportError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search events or organizations…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-0.5 bg-white rounded-lg border border-slate-200 p-1 shrink-0">
                  {(["all", "physical", "virtual"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setEventFormatFilter(f)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                        eventFormatFilter === f ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {loadingData ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <RowSkeleton key={i} />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Calendar size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No events yet</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Search size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No events match your search.</p>
                </div>
              ) : (
                <div>
                  {/* Column header labels — hidden columns match the row's own hidden
                      breakpoints below so labels never appear over data that isn't there.
                      Capture and the export column stay visible at every width since the
                      row itself always shows those controls (wrapping onto their own line
                      on narrow screens rather than disappearing). */}
                  <div className="hidden sm:flex items-center gap-3 px-4 pb-2 text-xs font-medium text-slate-500">
                    <div className="w-10 shrink-0" />
                    <div className="min-w-0 flex-1">Event</div>
                    <div className="hidden sm:block w-10 text-center shrink-0">Regs</div>
                    <div className="hidden sm:block w-10 text-center shrink-0">Leads</div>
                    <div className="hidden md:block w-32 shrink-0">Billing</div>
                    <div className="w-[188px] shrink-0">Capture</div>
                    <div className="w-[84px] shrink-0">Status</div>
                    <div className="w-[76px] shrink-0" />
                  </div>

                  <div className="space-y-2.5">
                    {filteredEvents.map((ev) => {
                      const org = orgById.get(ev.organization_id);
                      const gate = getCaptureGate(
                        windowFromEvent({ date: ev.date, endDate: ev.end_date ?? undefined, startTime: ev.start_time ?? undefined, endTime: ev.end_time ?? undefined }),
                        ev.timezone ?? undefined,
                        ev.capture_override
                      );
                      const busy = busyEventId === ev.id;
                      const regCount = activeRegistrations.filter((r) => r.event_id === ev.id).length;
                      const leadCount = leads.filter((l) => l.event_id === ev.id).length;
                      const billable = isBillable(ev);
                      const RowIcon = ev.event_format === "virtual" ? Presentation : getTemplate(ev.template_id ?? "education-fair").icon;
                      const pill = gate.open
                        ? { label: "Live", classes: "bg-emerald-500 text-white" }
                        : gate.reason === "not_started"
                          ? { label: "Upcoming", classes: "bg-amber-100 text-amber-700" }
                          : { label: "Closed", classes: "bg-slate-200 text-slate-600" };

                      return (
                        <div
                          key={ev.id}
                          className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-brand-600/30 hover:shadow-sm transition-all"
                        >
                          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                            <RowIcon size={18} className="text-brand-600" />
                          </div>

                          <div className="min-w-0 flex-1 order-1 sm:order-none basis-full sm:basis-auto">
                            <p className="font-semibold text-slate-900 text-sm truncate">{ev.name}</p>
                            <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                              <Calendar size={11} className="shrink-0" />
                              {new Date(ev.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              <span className="text-slate-300">·</span>
                              {ev.event_format === "virtual" ? <Presentation size={11} className="shrink-0" /> : <MapPin size={11} className="shrink-0" />}
                              {org ? (
                                <button type="button" onClick={() => goToOrg(org.name)} className="hover:text-brand-600 hover:underline truncate">
                                  {org.name}
                                </button>
                              ) : (
                                "—"
                              )}
                            </p>
                          </div>

                          <div className="hidden sm:block w-10 text-center text-sm text-slate-600 tabular-nums shrink-0">{regCount}</div>
                          <div className="hidden sm:block w-10 text-center text-sm text-slate-600 tabular-nums shrink-0">{leadCount}</div>

                          <div className="hidden md:block w-32 shrink-0">
                            {billable ? (
                              <span className="flex items-center gap-1.5">
                                <span className="text-slate-700 text-sm tabular-nums">{formatUSD(eventPrice(ev))}</span>
                                <button
                                  type="button"
                                  disabled={busyPaymentEventId === ev.id}
                                  onClick={() => toggleEventPaid(ev)}
                                  title={ev.payment_status === "paid" ? "Mark as pending" : "Mark as paid"}
                                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors disabled:opacity-60 ${
                                    ev.payment_status === "paid" ? "bg-teal-100 text-teal-700 hover:bg-teal-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  }`}
                                >
                                  {ev.payment_status}
                                </button>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">Free · virtual</span>
                            )}
                          </div>

                          <div className="flex gap-0.5 bg-slate-50 rounded-md p-0.5 border border-slate-200 w-[188px] shrink-0">
                            {(
                              [
                                { label: "Auto", value: null },
                                { label: "Open", value: "open" as const },
                                { label: "Closed", value: "closed" as const },
                              ] as const
                            ).map(({ label, value }) => (
                              <button
                                key={label}
                                type="button"
                                disabled={busy}
                                onClick={() => setEventCaptureOverride(ev, value)}
                                className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-60 ${
                                  (ev.capture_override ?? null) === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          <span className={`w-[84px] shrink-0 text-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${pill.classes}`}>
                            {pill.label}
                          </span>

                          <div className="flex items-center gap-1 w-[76px] shrink-0 justify-end">
                            <button
                              type="button"
                              onClick={() => exportEventLeads(ev)}
                              disabled={exportingEventId === ev.id}
                              title="Export leads (CSV)"
                              aria-label="Export leads (CSV)"
                              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Download size={14} />
                            </button>
                            {ev.event_format !== "virtual" && (
                              <button
                                type="button"
                                onClick={() => exportEventRegistrations(ev)}
                                disabled={exportingEventId === ev.id}
                                title="Export registrations (CSV)"
                                aria-label="Export registrations (CSV)"
                                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                              >
                                <Ticket size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {view === "billing" && (
            <>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl text-slate-900">Billing</h1>
                  <p className="text-slate-500 text-sm mt-0.5">Revenue across every organization, and the price charged for new events.</p>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh"
                  aria-label="Refresh"
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Revenue to date", value: formatUSD(revenue), accent: "#610064", bg: "#f5edf6" },
                  { label: "Revenue this week", value: formatUSD(revenueThisWeek), accent: "#0d9488", bg: "#e7f6f0" },
                  { label: "Pending revenue", value: formatUSD(pendingRevenue), accent: "#b45309", bg: "#fdf1e2" },
                  { label: "Waived (fee-exempt)", value: formatUSD(exemptedRevenue), accent: "#64748b", bg: "#f1f5f9" },
                ].map((tile, i) => (
                  <Reveal key={tile.label} index={i}>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: tile.bg }}>
                        <DollarSign size={16} style={{ color: tile.accent }} />
                      </div>
                      <p className="text-2xl font-bold text-slate-900 tabular-nums">{tile.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{tile.label}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="font-semibold text-slate-900">Per-event price</h2>
                  {!editingPrice && (
                    <button
                      type="button"
                      onClick={() => {
                        setPriceDraft(String(currentPrice));
                        setPriceError("");
                        setEditingPrice(true);
                      }}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Change price
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  What every organization pays when they create a new physical event — shown live on the public pricing page. Changing this only
                  affects events created from now on; past events keep the price they were actually charged.
                </p>
                {editingPrice ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        autoFocus
                        className="w-32 pl-6 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={savePrice}
                      disabled={savingPrice}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
                    >
                      {savingPrice ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPrice(false);
                        setPriceError("");
                      }}
                      disabled={savingPrice}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    {priceError && <p className="w-full text-xs text-rose-600">{priceError}</p>}
                  </div>
                ) : (
                  <p className="text-3xl font-bold text-slate-900 tabular-nums">{formatUSD(currentPrice)}</p>
                )}
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="font-semibold text-slate-900 mb-4">Revenue by month</h2>
                  {revenueByMonth.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No paid events yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const max = Math.max(...revenueByMonth.map((m) => m.total), 1);
                        return revenueByMonth.map((m, i) => (
                          <Reveal key={m.month} index={i}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm text-slate-600">{m.month}</span>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatUSD(m.total)}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${(m.total / max) * 100}%`, background: "linear-gradient(90deg, #c17bc7, #610064)" }}
                              />
                            </div>
                          </Reveal>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="font-semibold text-slate-900 mb-4">Top organizations by revenue</h2>
                  {revenueByOrg.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No paid events yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const max = Math.max(...revenueByOrg.map((r) => r.total), 1);
                        return revenueByOrg.map((r, i) => (
                          <Reveal key={r.org!.id} index={i}>
                            <div className="flex items-center justify-between mb-1.5">
                              <button type="button" onClick={() => goToOrg(r.org!.name)} className="text-sm text-slate-600 hover:text-brand-600 hover:underline truncate">
                                {r.org!.name}
                              </button>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{formatUSD(r.total)}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${(r.total / max) * 100}%`, background: "linear-gradient(90deg, #64748b, #1e293b)" }}
                              />
                            </div>
                          </Reveal>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {view === "admins" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl text-slate-900">Platform admins</h1>
                <p className="text-slate-500 text-sm mt-0.5">People with this same super-admin access, separate from any organization account.</p>
              </div>

              <div className="grid lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <UserPlus size={14} />
                    Grant an existing account
                  </h2>
                  <p className="text-xs text-slate-400 mb-3">
                    For someone who already has a Supabase Auth account (e.g. signed up as an organization) — this just grants that account platform
                    access.
                  </p>
                  <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="teammate@email.com"
                      required
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                    <button
                      type="submit"
                      disabled={addingAdmin}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 shrink-0 disabled:opacity-60 transition-transform active:scale-[0.97]"
                    >
                      <UserPlus size={14} />
                      {addingAdmin ? "Adding…" : "Grant access"}
                    </button>
                  </form>
                  {addAdminError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mt-3">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      {addAdminError}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <KeyRound size={14} />
                    Create a new admin account
                  </h2>
                  <p className="text-xs text-slate-400 mb-3">Creates a brand-new sign-in for someone who doesn&apos;t have an account yet, with platform access already granted.</p>
                  <form onSubmit={handleCreateAccount} className="space-y-2">
                    <input
                      type="email"
                      value={newAccountEmail}
                      onChange={(e) => setNewAccountEmail(e.target.value)}
                      placeholder="newadmin@email.com"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={newAccountPassword}
                        onChange={(e) => setNewAccountPassword(e.target.value)}
                        placeholder="Temporary password (8+ characters)"
                        required
                        minLength={8}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                      />
                      <button
                        type="submit"
                        disabled={creatingAccount}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 shrink-0 disabled:opacity-60 transition-transform active:scale-[0.97]"
                      >
                        <KeyRound size={14} />
                        {creatingAccount ? "Creating…" : "Create account"}
                      </button>
                    </div>
                  </form>
                  {createAccountError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mt-3">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      {createAccountError}
                    </div>
                  )}
                  {createAccountSuccess && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-50 text-teal-700 text-sm mt-3">
                      <Check size={15} className="mt-0.5 shrink-0" />
                      {createAccountSuccess}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                {admins.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No platform admins yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {admins.map((admin, i) => (
                      <Reveal key={admin.user_id} index={i}>
                        <div className="flex items-center justify-between py-2.5 gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-900 truncate flex items-center gap-2">
                              {admin.email || admin.user_id}
                              {admin.user_id === currentUserId && (
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">You</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400">
                              added {new Date(admin.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAdmin(admin)}
                            disabled={admin.user_id === currentUserId || removingAdminId === admin.user_id || admins.length <= 1}
                            title={
                              admin.user_id === currentUserId
                                ? "You can't remove yourself — ask another platform admin"
                                : admins.length <= 1
                                  ? "Can't remove the last remaining platform admin"
                                  : "Remove platform admin access"
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent shrink-0"
                          >
                            <Trash2 size={13} />
                            Remove
                          </button>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Delete-organization confirmation */}
      {orgPendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => (deletingOrgId ? null : setOrgPendingDelete(null))} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 size={18} />
            </div>
            <h2 className="font-display text-lg text-slate-900 mb-1.5">Delete {orgPendingDelete.name}?</h2>
            <p className="text-sm text-slate-500 mb-4">
              This permanently deletes the organization and everything under it — events, leads, registrations, staff, and destinations — and the
              owner&apos;s login itself, so this email can be used to sign up again. This can&apos;t be undone.
            </p>
            {deleteError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-4">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOrgPendingDelete(null)}
                disabled={!!deletingOrgId}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteOrg}
                disabled={!!deletingOrgId}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
              >
                {deletingOrgId ? "Deleting…" : "Delete organization"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
