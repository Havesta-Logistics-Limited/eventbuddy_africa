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
  Wrench,
  ClipboardList,
  Mail,
  Phone,
  Landmark,
  Clock,
  CheckCircle2,
  FileText,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";
import { Reveal } from "@/components/reveal";
import { RowSkeleton, StatTileSkeleton } from "@/components/skeleton";
import { Logo } from "@/components/logo";
import { AuthLoading } from "@/components/auth-loading";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { MfaNagBanner } from "@/components/mfa-nag-banner";
import { downloadCsv } from "@/lib/csv";
import { TICKET_FEE_PERCENTAGE, formatNaira, updateTicketFeePercentage } from "@/lib/billing";
import { DEFAULT_MAINTENANCE_MESSAGE, DEFAULT_MAINTENANCE_TITLE, updateMaintenanceState } from "@/lib/maintenance";
import { getTemplate } from "@/lib/event-templates";
import { PlatformDocumentsTab } from "@/components/platform-documents-tab";

const SIDEBAR_BG = "#22103A";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const NAV = [
  { id: "organizations", label: "Organizations", icon: Building2 },
  { id: "mobile", label: "Mobile App", icon: Smartphone },
  { id: "events", label: "Events", icon: Calendar },
  { id: "billing", label: "Billing", icon: DollarSign },
  { id: "documents", label: "Quotes & Invoices", icon: FileText },
  { id: "managed-requests", label: "Managed Events", icon: ClipboardList },
  { id: "payouts", label: "Payouts", icon: Landmark },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "admins", label: "Team", icon: ShieldCheck },
  { id: "security", label: "Security", icon: KeyRound },
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
  paystack_subaccount_code: string | null;
  payout_bank_name: string | null;
  /** Pre-masked server-side by organizations_payout_masked (see 0042) — the real
   *  value never reaches the browser in the bulk list. Fetched on demand, per org,
   *  via /api/platform/reveal-payout only when an admin explicitly asks. */
  payout_account_number_masked: string | null;
  payout_account_name: string | null;
  payout_change_status: "none" | "requested" | "approved";
  payout_change_requested_at: string | null;
  pending_name: string | null;
  name_change_status: "none" | "requested";
  name_change_requested_at: string | null;
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
  price_naira: number;
  capture_override: "open" | "closed" | null;
  created_at: string;
};
type LeadRow = { id: string; organization_id: string; event_id: string; source: "web" | "mobile" };
type RegistrationRow = { id: string; organization_id: string; event_id: string; status: string; created_at: string; source: "web" | "mobile" };
type AdminRow = { user_id: string; email: string | null; created_at: string };
type ManagedRequestRow = {
  id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  organization_name: string | null;
  event_name: string;
  event_date: string | null;
  expected_attendees: string | null;
  city: string;
  message: string | null;
  status: "new" | "contacted" | "quoted" | "closed";
  created_at: string;
};
type TransactionRow = {
  id: string;
  organization_id: string;
  event_id: string;
  reference: string;
  amount_naira: number;
  charge_currency: string;
  charge_amount_minor: number;
  status: "pending" | "success" | "failed" | "refunded" | "disputed";
  created_at: string;
  verified_at: string | null;
  purpose: "event_publish" | "ticket_purchase";
  /** Paystack's own recorded split for this charge — fees_split.integration is
   *  exactly what landed in the platform's account, ground truth straight from
   *  Paystack rather than recomputed from the *current* fee percentage (which may
   *  have changed since this specific subaccount was created). `domain` is
   *  Paystack's own "test" vs "live" tag on the charge — this table has no separate
   *  test/live split of its own (unlike Paystack itself), so transactions completed
   *  while testing with a sk_test_ key sit permanently alongside real ones unless
   *  filtered out here. */
  paystack_event: { domain?: string; fees_split?: { integration?: number } } | null;
};

/** True only for a real, successful, LIVE-mode ticket purchase — excludes anything
 *  completed while testing with a test-mode secret key, so switching to a live key
 *  doesn't retroactively count old test transactions as real commission earned. */
function isLiveTicketSale(t: TransactionRow): boolean {
  return t.purpose === "ticket_purchase" && t.status === "success" && t.paystack_event?.domain === "live";
}

/** Platform commission actually taken on a successful live ticket-purchase charge,
 *  in Naira — 0 for anything else (pending/failed, or test-mode). Ticket-sale
 *  commission is the platform's only revenue mechanism — see migration 0045. */
function ticketCommissionNaira(t: TransactionRow): number {
  if (!isLiveTicketSale(t)) return 0;
  return Number(t.paystack_event?.fees_split?.integration ?? 0) / 100;
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
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [attendeeAccounts, setAttendeeAccounts] = useState<{ id: string; email: string; fullName: string; createdAt: string }[]>([]);
  const [devicePushTokenCount, setDevicePushTokenCount] = useState<{ ios: number; android: number }>({ ios: 0, android: 0 });
  const [txnSearch, setTxnSearch] = useState("");
  const [txnStatusFilter, setTxnStatusFilter] = useState<"all" | "pending" | "success" | "failed" | "refunded" | "disputed">("all");
  const [refundingTxnRef, setRefundingTxnRef] = useState<string | null>(null);
  const [managedRequests, setManagedRequests] = useState<ManagedRequestRow[]>([]);
  const [managedStatusFilter, setManagedStatusFilter] = useState<"all" | "new" | "contacted" | "quoted" | "closed">("all");
  const [busyManagedRequestId, setBusyManagedRequestId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedAccountNumbers, setRevealedAccountNumbers] = useState<Record<string, string>>({});
  const [revealingOrgId, setRevealingOrgId] = useState<string | null>(null);

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


  const [currentFeePct, setCurrentFeePct] = useState(TICKET_FEE_PERCENTAGE);
  const [feePctDraft, setFeePctDraft] = useState("");
  const [editingFeePct, setEditingFeePct] = useState(false);
  const [savingFeePct, setSavingFeePct] = useState(false);
  const [feePctError, setFeePctError] = useState("");

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState(DEFAULT_MAINTENANCE_TITLE);
  const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_MAINTENANCE_MESSAGE);
  const [maintenanceTitleDraft, setMaintenanceTitleDraft] = useState("");
  const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState("");
  const [editingMaintenanceCopy, setEditingMaintenanceCopy] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");

  /** Runs both the initial load and manual/focus refreshes. Surfaces the first query
   *  error instead of silently falling back to empty lists — a missing migration
   *  (e.g. a column a query selects not existing yet) previously failed every query
   *  silently, showing "no organizations yet" even when the data was fine. */
  async function fetchPlatformData() {
    const supabase = createClient();
    const [orgsRes, eventsRes, leadsRes, registrationsRes, adminsRes, settingsRes, transactionsRes, managedRequestsRes, deviceTokensRes, attendeeAccountsRes] = await Promise.all([
      // organizations_payout_masked (see 0042_refunds_and_payout_masking.sql), not
      // the raw table — the account number arrives pre-masked, so the real value
      // never reaches the browser for the bulk list.
      supabase
        .from("organizations_payout_masked")
        .select(
          "id, name, slug, created_at, is_suspended, is_fee_exempt, is_verified, phone, email, paystack_subaccount_code, payout_bank_name, payout_account_number_masked, payout_account_name, payout_change_status, payout_change_requested_at, pending_name, name_change_status, name_change_requested_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select(
          "id, organization_id, name, date, end_date, start_time, end_time, timezone, template_id, event_format, payment_status, price_naira, capture_override, created_at"
        ),
      supabase.from("leads").select("id, organization_id, event_id, source"),
      supabase.from("registrations").select("id, organization_id, event_id, status, created_at, source"),
      supabase.from("platform_admins").select("user_id, email, created_at").order("created_at", { ascending: true }),
      supabase
        .from("platform_settings")
        .select("ticket_fee_percentage, maintenance_mode, maintenance_title, maintenance_message")
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("paystack_transactions")
        .select("id, organization_id, event_id, reference, amount_naira, charge_currency, charge_amount_minor, status, created_at, verified_at, purpose, paystack_event")
        .order("created_at", { ascending: false }),
      supabase
        .from("managed_event_requests")
        .select("id, contact_name, contact_email, contact_phone, organization_name, event_name, event_date, expected_attendees, city, message, status, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("device_push_tokens").select("platform"),
      fetch("/api/platform/attendee-accounts").then((r) => r.json()),
    ]);
    const firstError = orgsRes.error || eventsRes.error || leadsRes.error || registrationsRes.error || adminsRes.error || transactionsRes.error || managedRequestsRes.error;
    setLoadError(firstError ? firstError.message : "");
    setOrgs((orgsRes.data as OrgRow[]) ?? []);
    setEvents((eventsRes.data as EventRow[]) ?? []);
    const deviceTokens = (deviceTokensRes.data as { platform: "ios" | "android" }[] | null) ?? [];
    setDevicePushTokenCount({ ios: deviceTokens.filter((t) => t.platform === "ios").length, android: deviceTokens.filter((t) => t.platform === "android").length });
    setAttendeeAccounts(attendeeAccountsRes?.attendees ?? []);
    setLeads((leadsRes.data as LeadRow[]) ?? []);
    setRegistrations((registrationsRes.data as RegistrationRow[]) ?? []);
    setAdmins((adminsRes.data as AdminRow[]) ?? []);
    setTransactions((transactionsRes.data as TransactionRow[]) ?? []);
    setManagedRequests((managedRequestsRes.data as ManagedRequestRow[]) ?? []);
    if (settingsRes.data) {
      setCurrentFeePct(Number(settingsRes.data.ticket_fee_percentage));
      setMaintenanceMode(!!settingsRes.data.maintenance_mode);
      setMaintenanceTitle(settingsRes.data.maintenance_title || DEFAULT_MAINTENANCE_TITLE);
      setMaintenanceMessage(settingsRes.data.maintenance_message || DEFAULT_MAINTENANCE_MESSAGE);
    }
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
    const nextExempt = !org.is_fee_exempt;
    try {
      const res = await fetch("/api/platform/toggle-fee-exempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, exempt: nextExempt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't update fee exemption.");
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_fee_exempt: nextExempt } : o)));
      if (json.warning) {
        toast.warning(json.warning);
      } else {
        toast.success(nextExempt ? `${org.name} exempted from ticket commission` : `${org.name} — fee exemption removed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update fee exemption.");
    }
    setBusyOrgId(null);
  }

  async function approvePayoutChange(org: OrgRow) {
    setBusyOrgId(org.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ payout_change_status: "approved", payout_change_approved_at: new Date().toISOString() })
      .eq("id", org.id);
    if (!error) {
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, payout_change_status: "approved" } : o)));
      toast.success(`${org.name} can now update their payout details`);
    } else {
      toast.error(error.message);
    }
    setBusyOrgId(null);
  }

  // Unlike a payout change, the requested value itself is already visible up
  // front (see the pending-requests card), so approving applies it directly
  // in one step rather than just unlocking a resubmission — there's nothing
  // secret about a display name that would call for the extra round trip.
  async function approveNameChange(org: OrgRow) {
    if (!org.pending_name) return;
    setBusyOrgId(org.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ name: org.pending_name, pending_name: null, name_change_status: "none" })
      .eq("id", org.id);
    if (!error) {
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, name: org.pending_name!, pending_name: null, name_change_status: "none" } : o)));
      toast.success(`${org.name} renamed to ${org.pending_name}`);
    } else {
      toast.error(error.message);
    }
    setBusyOrgId(null);
  }

  /** Fetches the real, unmasked account number for exactly one org, on demand —
   *  the bulk list never carries it (see organizations_payout_masked). Kept in
   *  its own bit of state, not merged into `orgs`, so it's never accidentally
   *  refetched/broadened by a general refresh. */
  async function revealAccountNumber(orgId: string) {
    setRevealingOrgId(orgId);
    try {
      const res = await fetch("/api/platform/reveal-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't reveal this account number.");
        return;
      }
      setRevealedAccountNumbers((prev) => ({ ...prev, [orgId]: json.accountNumber || "—" }));
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setRevealingOrgId(null);
    }
  }

  /** Manual reconciliation for a refund processed outside the automated webhook
   *  path — calls the same handleRefundOrDispute logic the webhook uses, so a
   *  registration gets cancelled and any ticket/discount capacity it used is
   *  restored exactly as if the webhook itself had fired. */
  async function manualRefund(reference: string) {
    if (!confirm("Mark this transaction as refunded in our records? This does NOT process a real Paystack refund or move any money — it only cancels the attendee's registration and restores any ticket/discount-code capacity it used. If the money hasn't actually been refunded yet, do that separately in the Paystack dashboard first.")) return;
    setRefundingTxnRef(reference);
    try {
      const res = await fetch("/api/platform/manual-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't process this refund.");
        return;
      }
      setTransactions((prev) => prev.map((t) => (t.reference === reference ? { ...t, status: "refunded" } : t)));
      toast.success("Marked as refunded");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setRefundingTxnRef(null);
    }
  }

  async function updateManagedRequestStatus(req: ManagedRequestRow, status: ManagedRequestRow["status"]) {
    setBusyManagedRequestId(req.id);
    const supabase = createClient();
    const { error } = await supabase.from("managed_event_requests").update({ status }).eq("id", req.id);
    if (!error) {
      setManagedRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status } : r)));
    } else {
      toast.error(error.message);
    }
    setBusyManagedRequestId(null);
  }

  async function saveFeePct() {
    const parsed = Number(feePctDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setFeePctError("Enter a valid percentage between 0 and 100.");
      return;
    }
    setFeePctError("");
    setSavingFeePct(true);
    try {
      await updateTicketFeePercentage(parsed);
      setCurrentFeePct(parsed);
      setEditingFeePct(false);
      toast.success(`Ticket fee updated to ${parsed}%`);
    } catch (err) {
      setFeePctError(err instanceof Error ? err.message : "Couldn't save the new fee.");
    } finally {
      setSavingFeePct(false);
    }
  }

  async function toggleMaintenanceMode() {
    const next = !maintenanceMode;
    setSavingMaintenance(true);
    setMaintenanceError("");
    try {
      await updateMaintenanceState({ maintenanceMode: next, maintenanceTitle, maintenanceMessage });
      setMaintenanceMode(next);
      toast.success(next ? "Maintenance mode is now on — the site is showing the maintenance page to visitors." : "Maintenance mode is off — the site is live again.");
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : "Couldn't change maintenance mode.");
    } finally {
      setSavingMaintenance(false);
    }
  }

  async function saveMaintenanceCopy() {
    const title = maintenanceTitleDraft.trim();
    const message = maintenanceMessageDraft.trim();
    if (!title || !message) {
      setMaintenanceError("Both a title and a message are required.");
      return;
    }
    setSavingMaintenance(true);
    setMaintenanceError("");
    try {
      await updateMaintenanceState({ maintenanceMode, maintenanceTitle: title, maintenanceMessage: message });
      setMaintenanceTitle(title);
      setMaintenanceMessage(message);
      setEditingMaintenanceCopy(false);
      toast.success("Maintenance page updated");
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : "Couldn't save the maintenance page copy.");
    } finally {
      setSavingMaintenance(false);
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

  function exportTransactions(rows: TransactionRow[]) {
    const csv = csvFrom(
      ["Organization", "Email", "Event", "Amount (₦)", "Charged", "Paystack Reference", "Status", "Date"],
      rows.map((t) => {
        const org = orgById.get(t.organization_id);
        const ev = eventById.get(t.event_id);
        return [
          org?.name ?? t.organization_id,
          org?.email ?? "",
          ev?.name ?? t.event_id,
          formatNaira(Number(t.amount_naira)),
          `${(t.charge_amount_minor / 100).toFixed(2)} ${t.charge_currency}`,
          t.reference,
          t.status,
          new Date(t.created_at).toLocaleString("en-GB"),
        ];
      })
    );
    downloadCsv("eventbuddy_payments.csv", csv);
    toast.success(`${rows.length} payment${rows.length === 1 ? "" : "s"} exported`);
  }

  function copyOrgId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      toast.success("Organization ID copied");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function copyReference(reference: string) {
    navigator.clipboard.writeText(reference).then(() => {
      setCopiedId(reference);
      toast.success("Reference copied");
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
    return <AuthLoading />;
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: SIDEBAR_BG }}>
        <div className="text-center max-w-sm">
          <Logo tone="white" height={18} className="mx-auto mb-6 opacity-90" />
          <p className="font-display text-xl text-white mb-2">Not authorized</p>
          <p className="text-sm text-white/40 mb-6">This account doesn&apos;t have platform admin access.</p>
          <button type="button" onClick={handleSignOut} className="text-sm font-medium text-[#FF8AF5] hover:underline">
            Sign out and try a different account
          </button>
        </div>
      </div>
    );
  }

  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const activeRegistrations = registrations.filter((r) => r.status !== "cancelled");

  // Ticket-sale commission is the platform's only revenue mechanism (the
  // flat event-publish fee was scrapped — see migration 0045): a paid ticket
  // checkout splits automatically via each org's Paystack subaccount, and
  // eventbuddy's cut of that split is the commission tracked below.
  const ticketPurchaseTxns = transactions.filter(isLiveTicketSale);
  const ticketGrossRevenue = ticketPurchaseTxns.reduce((sum, t) => sum + Number(t.amount_naira), 0);
  const ticketCommissionRevenue = ticketPurchaseTxns.reduce((sum, t) => sum + ticketCommissionNaira(t), 0);
  const ticketCommissionThisWeek = ticketPurchaseTxns
    .filter((t) => now - new Date(t.verified_at || t.created_at).getTime() < WEEK_MS)
    .reduce((sum, t) => sum + ticketCommissionNaira(t), 0);

  const ticketRevenueByOrg = Array.from(
    ticketPurchaseTxns.reduce((map, t) => {
      const entry = map.get(t.organization_id) ?? { gross: 0, commission: 0 };
      entry.gross += Number(t.amount_naira);
      entry.commission += ticketCommissionNaira(t);
      map.set(t.organization_id, entry);
      return map;
    }, new Map<string, { gross: number; commission: number }>())
  )
    .map(([orgId, totals]) => ({ org: orgById.get(orgId), ...totals }))
    .filter((r) => r.org)
    .sort((a, b) => b.gross - a.gross);

  const ticketRevenueByOrgByCommission = ticketRevenueByOrg.slice().sort((a, b) => b.commission - a.commission).slice(0, 8);

  const ticketRevenueByMonth = Array.from(
    ticketPurchaseTxns
      .slice()
      .sort((a, b) => new Date(a.verified_at || a.created_at).getTime() - new Date(b.verified_at || b.created_at).getTime())
      .reduce((map, t) => {
        const key = new Date(t.verified_at || t.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        map.set(key, (map.get(key) ?? 0) + ticketCommissionNaira(t));
        return map;
      }, new Map<string, number>())
  ).map(([month, total]) => ({ month, total }));

  // Every individual Paystack attempt (success, failed, or still pending) — unlike the
  // revenue figures above, which only reflect an event's current payment_status, this
  // is a durable log: a failed retry followed by a successful payment still shows both
  // rows, so nothing about a payment's history is ever lost.
  const filteredTransactions = transactions
    .filter((t) => txnStatusFilter === "all" || t.status === txnStatusFilter)
    .filter((t) => {
      if (!txnSearch.trim()) return true;
      const q = txnSearch.trim().toLowerCase();
      const org = orgById.get(t.organization_id);
      const ev = eventById.get(t.event_id);
      return [org?.name, org?.email, ev?.name, t.reference].some((v) => v?.toLowerCase().includes(q));
    });

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
    { label: "Revenue to date", value: formatNaira(ticketCommissionRevenue), icon: DollarSign, delta: null },
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
            <Icon size={17} className={active ? "text-[#FF8AF5]" : undefined} />
            {label}
          </button>
        );
      })}
    </nav>
  );

  const sidebarFooter = (
    <div className="px-3 pb-5 border-t border-white/10 pt-4">
      <div className="flex items-center gap-3 px-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-[#FF8AF5]/15 flex items-center justify-center text-[#FF8AF5] font-semibold text-sm shrink-0">
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
          <Logo tone="white" height={18} />
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
        <Logo tone="white" height={12} />
      </header>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 text-white flex flex-col h-full animate-drawer-in" style={{ background: SIDEBAR_BG }}>
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <Logo tone="white" height={13} />
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                <X size={20} className="text-white/60" />
              </button>
            </div>
            {sidebarNav}
            {sidebarFooter}
          </div>
          <div className="flex-1 bg-black/50 animate-modal-backdrop" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 md:ml-64 min-h-screen pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {view !== "security" && <MfaNagBanner onSetup={() => setView("security")} />}
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
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FFF3FD" }}>
                              <s.icon size={16} style={{ color: "#C21FAF" }} />
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
              {ticketPurchaseTxns.length === 0 && (
                <p className="text-xs text-slate-400 mb-6 -mt-2">
                  No ticket sales yet — revenue shows here once an org sells a paid ticket. Publishing an event itself is always free, physical or
                  virtual.
                </p>
              )}

              {(() => {
                const pendingNameChanges = orgs.filter((o) => o.name_change_status === "requested" && o.pending_name);
                if (pendingNameChanges.length === 0) return null;
                return (
                  <div className="mb-6">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2.5">Pending name change requests ({pendingNameChanges.length})</h2>
                    <div className="space-y-3">
                      {pendingNameChanges.map((org) => (
                        <div key={org.id} className="bg-white rounded-xl border border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-500">
                              <span className="font-medium text-slate-900">{org.name}</span> wants to rename to{" "}
                              <span className="font-medium text-amber-700">{org.pending_name}</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Requested{" "}
                              {org.name_change_requested_at
                                ? new Date(org.name_change_requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                                : "recently"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => approveNameChange(org)}
                            disabled={busyOrgId === org.id}
                            className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
                          const orgBilling = ticketRevenueByOrg.find((r) => r.org?.id === org.id)?.commission ?? 0;
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
                                {formatNaira(orgBilling)}
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
                <p className="text-slate-500 text-sm mt-0.5">Every event across every organization, physical and virtual.</p>
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
                  <p className="text-slate-500 text-sm mt-0.5">Revenue across every organization — your commission on ticket sales.</p>
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

              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: "Total revenue", value: formatNaira(ticketCommissionRevenue), accent: "#C21FAF", bg: "#FFF3FD" },
                  { label: "Revenue this week", value: formatNaira(ticketCommissionThisWeek), accent: "#0d9488", bg: "#e7f6f0" },
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
                  <h2 className="font-semibold text-slate-900">Ticket transaction fee</h2>
                  {!editingFeePct && (
                    <button
                      type="button"
                      onClick={() => {
                        setFeePctDraft(String(currentFeePct));
                        setFeePctError("");
                        setEditingFeePct(true);
                      }}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Change fee
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  eventbuddy&apos;s cut of every self-serve ticket sale — the rest settles straight to the organizer&apos;s own bank account via
                  their Paystack subaccount. Only applies to organizations that set up payouts from now on; existing subaccounts keep the rate
                  they were created with.
                </p>
                {editingFeePct ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={feePctDraft}
                        onChange={(e) => setFeePctDraft(e.target.value)}
                        autoFocus
                        className="w-24 pl-3 pr-7 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={saveFeePct}
                      disabled={savingFeePct}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
                    >
                      {savingFeePct ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFeePct(false);
                        setFeePctError("");
                      }}
                      disabled={savingFeePct}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    {feePctError && <p className="w-full text-xs text-rose-600">{feePctError}</p>}
                  </div>
                ) : (
                  <p className="text-3xl font-bold text-slate-900 tabular-nums">{currentFeePct}%</p>
                )}
              </div>

              <div className="mb-6">
                <h2 className="font-semibold text-slate-900 mb-1">Ticket sales &amp; commission</h2>
                <p className="text-xs text-slate-500 mb-4">
                  Every paid ticket checkout, split automatically by Paystack between the organizer&apos;s bank account and eventbuddy&apos;s cut —
                  eventbuddy&apos;s only revenue mechanism.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  {[
                    { label: "Ticket sales (gross)", value: formatNaira(ticketGrossRevenue), accent: "#6D28D9", bg: "#F1EBFE" },
                    { label: "Platform commission", value: formatNaira(ticketCommissionRevenue), accent: "#C21FAF", bg: "#FFF3FD" },
                    { label: "Commission this week", value: formatNaira(ticketCommissionThisWeek), accent: "#0d9488", bg: "#e7f6f0" },
                  ].map((tile) => (
                    <div key={tile.label} className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: tile.bg }}>
                        <DollarSign size={16} style={{ color: tile.accent }} />
                      </div>
                      <p className="text-2xl font-bold text-slate-900 tabular-nums">{tile.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{tile.label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {ticketRevenueByOrg.length === 0 ? (
                    <p className="text-sm text-slate-400 py-10 text-center">No ticket sales yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Organization</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Gross ticket sales</th>
                            <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Your commission</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ticketRevenueByOrg.map((r) => (
                            <tr key={r.org!.id} className="hover:bg-slate-50">
                              <td className="px-5 py-3 font-medium text-slate-900">{r.org!.name}</td>
                              <td className="px-4 py-3 text-slate-700 tabular-nums">{formatNaira(r.gross)}</td>
                              <td className="px-5 py-3 text-slate-700 tabular-nums font-semibold">{formatNaira(r.commission)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="font-semibold text-slate-900 mb-4">Ticket commission revenue by month</h2>
                  {ticketRevenueByMonth.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No ticket sales yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const max = Math.max(...ticketRevenueByMonth.map((m) => m.total), 1);
                        return ticketRevenueByMonth.map((m, i) => (
                          <Reveal key={m.month} index={i}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm text-slate-600">{m.month}</span>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatNaira(m.total)}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${(m.total / max) * 100}%`, background: "#C21FAF" }}
                              />
                            </div>
                          </Reveal>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="font-semibold text-slate-900 mb-4">Top organizations by ticket commission</h2>
                  {ticketRevenueByOrgByCommission.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No ticket sales yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const max = Math.max(...ticketRevenueByOrgByCommission.map((r) => r.commission), 1);
                        return ticketRevenueByOrgByCommission.map((r, i) => (
                          <Reveal key={r.org!.id} index={i}>
                            <div className="flex items-center justify-between mb-1.5">
                              <button type="button" onClick={() => goToOrg(r.org!.name)} className="text-sm text-slate-600 hover:text-brand-600 hover:underline truncate">
                                {r.org!.name}
                              </button>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{formatNaira(r.commission)}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${(r.commission / max) * 100}%`, background: "#6D28D9" }}
                              />
                            </div>
                          </Reveal>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">All payments</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Every Paystack attempt — success, failed, or still pending.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportTransactions(filteredTransactions)}
                    disabled={filteredTransactions.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0"
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={txnSearch}
                      onChange={(e) => setTxnSearch(e.target.value)}
                      placeholder="Search organization, email, event, or reference..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                  <select
                    value={txnStatusFilter}
                    onChange={(e) => setTxnStatusFilter(e.target.value as typeof txnStatusFilter)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                  >
                    <option value="all">All statuses</option>
                    <option value="success">Success</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </div>

                {filteredTransactions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-10 text-center">
                    {transactions.length === 0 ? "No payment attempts yet." : "No payments match your search."}
                  </p>
                ) : (
                  <div className="overflow-x-auto -mx-5">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-y border-slate-200">
                        <tr>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Organization</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Event</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Amount</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Reference</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Status</th>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.map((t) => {
                          const org = orgById.get(t.organization_id);
                          const ev = eventById.get(t.event_id);
                          const statusPill = {
                            success: "bg-emerald-100 text-emerald-700",
                            pending: "bg-amber-100 text-amber-700",
                            failed: "bg-rose-100 text-rose-700",
                            refunded: "bg-slate-100 text-slate-500",
                            disputed: "bg-orange-100 text-orange-700",
                          }[t.status];
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/60">
                              <td className="px-5 py-3 max-w-[200px]">
                                {org ? (
                                  <button type="button" onClick={() => goToOrg(org.name)} className="text-slate-900 font-medium hover:text-brand-600 hover:underline truncate block text-left">
                                    {org.name}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {org?.email && <p className="text-[11px] text-slate-400 truncate">{org.email}</p>}
                              </td>
                              <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{ev?.name ?? "—"}</td>
                              <td className="px-4 py-3 text-slate-900 font-medium tabular-nums whitespace-nowrap">{formatNaira(Number(t.amount_naira))}</td>
                              <td className="px-4 py-3 max-w-[140px]">
                                <button
                                  type="button"
                                  onClick={() => copyReference(t.reference)}
                                  title={t.reference}
                                  className="flex items-center gap-1 text-slate-500 hover:text-slate-700 font-mono text-xs truncate max-w-full"
                                >
                                  {copiedId === t.reference ? <Check size={10} className="shrink-0 text-teal-600" /> : <Copy size={10} className="shrink-0" />}
                                  <span className="truncate">{t.reference}</span>
                                </button>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusPill}`}>{t.status}</span>
                                  {t.status === "success" && (
                                    <button
                                      type="button"
                                      onClick={() => manualRefund(t.reference)}
                                      disabled={refundingTxnRef === t.reference}
                                      title="Records-only: cancels the registration and restores capacity. Does not call Paystack — refund the money separately in the Paystack dashboard."
                                      className="text-[11px] font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50"
                                    >
                                      {refundingTxnRef === t.reference ? "…" : "Mark refunded"}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{new Date(t.created_at).toLocaleString("en-GB")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "mobile" && (
            <>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl text-slate-900">Mobile App</h1>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Attendee accounts and activity from the eventbuddy mobile app. Real app-store install counts aren&apos;t
                    something this dashboard can show — that only exists once the app is published, and lives in App Store
                    Connect / Play Console instead.
                  </p>
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

              {(() => {
                const mobileRegistrations = registrations.filter((r) => r.source === "mobile").length + leads.filter((l) => l.source === "mobile").length;
                const totalRegistrations = registrations.length + leads.length;
                const mobileSharePct = totalRegistrations > 0 ? Math.round((mobileRegistrations / totalRegistrations) * 100) : 0;
                const totalDevices = devicePushTokenCount.ios + devicePushTokenCount.android;
                const tiles = [
                  { label: "Attendee accounts", value: attendeeAccounts.length.toLocaleString(), accent: "#C21FAF", bg: "#FFF3FD", icon: Users2 },
                  {
                    label: `Devices with push enabled (${devicePushTokenCount.ios} iOS · ${devicePushTokenCount.android} Android)`,
                    value: totalDevices.toLocaleString(),
                    accent: "#6D28D9",
                    bg: "#F1EBFE",
                    icon: Smartphone,
                  },
                  { label: "Registrations via mobile", value: mobileRegistrations.toLocaleString(), accent: "#E85D0A", bg: "#FFF1E6", icon: Ticket },
                  { label: "Mobile share of all registrations", value: `${mobileSharePct}%`, accent: "#0d9488", bg: "#e7f6f0", icon: DollarSign },
                ];
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {tiles.map((tile, i) => (
                      <Reveal key={tile.label} index={i}>
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: tile.bg }}>
                            <tile.icon size={16} style={{ color: tile.accent }} />
                          </div>
                          <p className="text-2xl font-bold text-slate-900 tabular-nums">{tile.value}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{tile.label}</p>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                );
              })()}

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 className="font-semibold text-slate-900 mb-1">Recent attendee signups</h2>
                <p className="text-xs text-slate-500 mb-4">The most recent accounts created in the mobile app.</p>
                {attendeeAccounts.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No attendee accounts yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                          <th className="pb-2 pr-4 font-medium">Name</th>
                          <th className="pb-2 pr-4 font-medium">Email</th>
                          <th className="pb-2 font-medium">Signed up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendeeAccounts.slice(0, 25).map((a) => (
                          <tr key={a.id} className="border-b border-slate-50 last:border-0">
                            <td className="py-2.5 pr-4 text-slate-900">{a.fullName || "—"}</td>
                            <td className="py-2.5 pr-4 text-slate-600">{a.email}</td>
                            <td className="py-2.5 text-slate-500">{new Date(a.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "documents" && <PlatformDocumentsTab />}

          {view === "managed-requests" && (
            <>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl text-slate-900">Managed Events</h1>
                  <p className="text-slate-500 text-sm mt-0.5">Quote requests from the &quot;let us run it for you&quot; page — reach out and update their status here.</p>
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

              <div className="flex flex-wrap gap-2 mb-5">
                {(["all", "new", "contacted", "quoted", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setManagedStatusFilter(s)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                      managedStatusFilter === s ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {(() => {
                const filteredRequests = managedRequests.filter((r) => managedStatusFilter === "all" || r.status === managedStatusFilter);
                const statusPill: Record<ManagedRequestRow["status"], string> = {
                  new: "bg-amber-100 text-amber-700",
                  contacted: "bg-blue-100 text-blue-700",
                  quoted: "bg-brand-100 text-brand-700",
                  closed: "bg-slate-100 text-slate-500",
                };
                return filteredRequests.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                    <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
                    <p>{managedRequests.length === 0 ? "No managed-event requests yet." : "No requests match this filter."}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRequests.map((req) => (
                      <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{req.event_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Submitted {new Date(req.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          </div>
                          <select
                            value={req.status}
                            onChange={(e) => updateManagedRequestStatus(req, e.target.value as ManagedRequestRow["status"])}
                            disabled={busyManagedRequestId === req.id}
                            className={`shrink-0 text-xs font-semibold capitalize px-2.5 py-1 rounded-full border-0 disabled:opacity-50 ${statusPill[req.status]}`}
                          >
                            {(["new", "contacted", "quoted", "closed"] as const).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
                          <p className="flex items-center gap-1.5 text-slate-600">
                            <Mail size={13} className="text-slate-400 shrink-0" />
                            <a href={`mailto:${req.contact_email}`} className="hover:text-brand-600 hover:underline truncate">
                              {req.contact_name} — {req.contact_email}
                            </a>
                          </p>
                          {req.contact_phone && (
                            <p className="flex items-center gap-1.5 text-slate-600">
                              <Phone size={13} className="text-slate-400 shrink-0" />
                              <a href={`tel:${req.contact_phone}`} className="hover:text-brand-600 hover:underline">
                                {req.contact_phone}
                              </a>
                            </p>
                          )}
                          {req.organization_name && (
                            <p className="flex items-center gap-1.5 text-slate-600">
                              <Building2 size={13} className="text-slate-400 shrink-0" />
                              {req.organization_name}
                            </p>
                          )}
                          <p className="flex items-center gap-1.5 text-slate-600">
                            <MapPin size={13} className="text-slate-400 shrink-0" />
                            {req.city}
                          </p>
                          {req.event_date && (
                            <p className="flex items-center gap-1.5 text-slate-600">
                              <Calendar size={13} className="text-slate-400 shrink-0" />
                              {new Date(req.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                          {req.expected_attendees && (
                            <p className="flex items-center gap-1.5 text-slate-600">
                              <Users2 size={13} className="text-slate-400 shrink-0" />
                              {req.expected_attendees} expected
                            </p>
                          )}
                        </div>
                        {req.message && <p className="text-sm text-slate-500 leading-relaxed pt-3 border-t border-slate-100">{req.message}</p>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}

          {view === "payouts" && (
            <>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl text-slate-900">Payouts</h1>
                  <p className="text-slate-500 text-sm mt-0.5">Every org&apos;s bank account, and any request to change one on file.</p>
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

              {(() => {
                const pending = orgs.filter((o) => o.payout_change_status === "requested");
                return (
                  <div className="mb-6">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2.5">
                      Pending change requests {pending.length > 0 && `(${pending.length})`}
                    </h2>
                    {pending.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">
                        <Clock size={26} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No pending payout change requests.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pending.map((org) => (
                          <div key={org.id} className="bg-white rounded-xl border border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{org.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Currently {org.payout_bank_name || "no bank"} · {revealedAccountNumbers[org.id] || org.payout_account_number_masked || "—"} — requested{" "}
                                {org.payout_change_requested_at
                                  ? new Date(org.payout_change_requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                                  : "recently"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => approvePayoutChange(org)}
                              disabled={busyOrgId === org.id}
                              className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} />
                              Approve
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2.5">All organizations</h2>
              {orgs.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Landmark size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No organizations yet</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Organization</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Bank</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Account number</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Account name</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orgs.map((org) => {
                          const statusPill = !org.paystack_subaccount_code
                            ? { label: "Not set up", className: "bg-slate-100 text-slate-500" }
                            : org.payout_change_status === "requested"
                              ? { label: "Change requested", className: "bg-amber-100 text-amber-700" }
                              : org.payout_change_status === "approved"
                                ? { label: "Change approved", className: "bg-brand-100 text-brand-700" }
                                : { label: "Connected", className: "bg-teal-100 text-teal-700" };
                          return (
                            <tr key={org.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 max-w-[200px]">
                                <p className="font-medium text-slate-900 truncate">{org.name}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{org.payout_bank_name || <span className="text-slate-300">—</span>}</td>
                              <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                                {revealedAccountNumbers[org.id] ? (
                                  revealedAccountNumbers[org.id]
                                ) : org.payout_account_number_masked ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    {org.payout_account_number_masked}
                                    <button
                                      type="button"
                                      onClick={() => revealAccountNumber(org.id)}
                                      disabled={revealingOrgId === org.id}
                                      className="font-sans text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50"
                                    >
                                      {revealingOrgId === org.id ? "…" : "Reveal"}
                                    </button>
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600 truncate max-w-[180px]">
                                {org.payout_account_name || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusPill.className}`}>{statusPill.label}</span>
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

          {view === "maintenance" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl text-slate-900">Maintenance</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  Take the site offline for every visitor except platform admins, and customize what they see while it&apos;s down.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${maintenanceMode ? "bg-rose-100" : "bg-emerald-100"}`}>
                      <Wrench size={18} className={maintenanceMode ? "text-rose-600" : "text-emerald-600"} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{maintenanceMode ? "Maintenance mode is ON" : "Site is live"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {maintenanceMode
                          ? "Every page except /platform is showing the maintenance page below."
                          : "Visitors see the normal site. Turn this on before making risky changes."}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleMaintenanceMode}
                    disabled={savingMaintenance}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 shrink-0 transition-colors ${
                      maintenanceMode ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {savingMaintenance ? "Saving…" : maintenanceMode ? "Turn off maintenance mode" : "Turn on maintenance mode"}
                  </button>
                </div>
                {maintenanceError && <p className="text-xs text-rose-600 mt-3">{maintenanceError}</p>}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="font-semibold text-slate-900">Maintenance page</h2>
                  <div className="flex items-center gap-3 shrink-0">
                    <a href="/maintenance" target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline">
                      Preview
                    </a>
                    {!editingMaintenanceCopy && (
                      <button
                        type="button"
                        onClick={() => {
                          setMaintenanceTitleDraft(maintenanceTitle);
                          setMaintenanceMessageDraft(maintenanceMessage);
                          setMaintenanceError("");
                          setEditingMaintenanceCopy(true);
                        }}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-4">What visitors see at any blocked URL while maintenance mode is on.</p>

                {editingMaintenanceCopy ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                      <input
                        value={maintenanceTitleDraft}
                        onChange={(e) => setMaintenanceTitleDraft(e.target.value)}
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Message</label>
                      <textarea
                        value={maintenanceMessageDraft}
                        onChange={(e) => setMaintenanceMessageDraft(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={saveMaintenanceCopy}
                        disabled={savingMaintenance}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
                      >
                        {savingMaintenance ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMaintenanceCopy(false);
                          setMaintenanceError("");
                        }}
                        disabled={savingMaintenance}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      {maintenanceError && <p className="w-full text-xs text-rose-600">{maintenanceError}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                    <p className="font-display text-base text-slate-900 mb-1">{maintenanceTitle}</p>
                    <p className="text-sm text-slate-500 leading-relaxed">{maintenanceMessage}</p>
                  </div>
                )}
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

          {view === "security" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl text-slate-900">Security</h1>
                <p className="text-slate-500 text-sm mt-0.5">Manage two-factor authentication for your own platform admin account.</p>
              </div>
              <div className="max-w-lg">
                <TwoFactorSettings />
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
