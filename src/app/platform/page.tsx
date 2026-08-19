"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPinCheckInside,
  Building2,
  Calendar,
  Users2,
  DollarSign,
  ChevronDown,
  Ban,
  RotateCcw,
  LogOut,
  ShieldOff,
  ShieldCheck,
  Copy,
  Check,
  UserPlus,
  Trash2,
  AlertCircle,
  Mail,
  Phone,
  Lock,
  LockOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";
import { Reveal } from "@/components/reveal";
import { RowSkeleton, StatTileSkeleton } from "@/components/skeleton";

const EVENT_PRICE_USD = 49.99;

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  is_suspended: boolean;
  is_fee_exempt: boolean;
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
  payment_status: string;
  capture_override: "open" | "closed" | null;
  created_at: string;
};
type LeadRow = { id: string; organization_id: string };
type AdminRow = { user_id: string; email: string | null; created_at: string };

export default function PlatformDashboard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [addAdminError, setAddAdminError] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);

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

      const [orgsRes, eventsRes, leadsRes, adminsRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, slug, created_at, is_suspended, is_fee_exempt, phone, email")
          .order("created_at", { ascending: false }),
        supabase.from("events").select("id, organization_id, name, date, end_date, start_time, end_time, timezone, payment_status, capture_override, created_at"),
        supabase.from("leads").select("id, organization_id"),
        supabase.from("platform_admins").select("user_id, email, created_at").order("created_at", { ascending: true }),
      ]);
      setOrgs((orgsRes.data as OrgRow[]) ?? []);
      setEvents((eventsRes.data as EventRow[]) ?? []);
      setLeads((leadsRes.data as LeadRow[]) ?? []);
      setAdmins((adminsRes.data as AdminRow[]) ?? []);
      setLoadingData(false);
    })();
  }, [router]);

  async function toggleSuspend(org: OrgRow) {
    setBusyOrgId(org.id);
    const supabase = createClient();
    const { error } = await supabase.from("organizations").update({ is_suspended: !org.is_suspended }).eq("id", org.id);
    if (!error) {
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_suspended: !o.is_suspended } : o)));
    }
    setBusyOrgId(null);
  }

  async function toggleFeeExempt(org: OrgRow) {
    setBusyOrgId(org.id);
    const supabase = createClient();
    const { error } = await supabase.from("organizations").update({ is_fee_exempt: !org.is_fee_exempt }).eq("id", org.id);
    if (!error) {
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_fee_exempt: !o.is_fee_exempt } : o)));
    }
    setBusyOrgId(null);
  }

  async function setEventCaptureOverride(event: EventRow, value: "open" | "closed" | null) {
    setBusyEventId(event.id);
    const supabase = createClient();
    const { error } = await supabase.from("events").update({ capture_override: value }).eq("id", event.id);
    if (!error) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, capture_override: value } : e)));
    }
    setBusyEventId(null);
  }

  function copyOrgId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
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
    }
    setNewAdminEmail("");
  }

  async function handleRemoveAdmin(admin: AdminRow) {
    setRemovingAdminId(admin.user_id);
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_platform_admin", { target_user_id: admin.user_id });
    if (!error) {
      setAdmins((prev) => prev.filter((a) => a.user_id !== admin.user_id));
    } else {
      setAddAdminError(error.message.replace(/^.*?:\s*/, ""));
    }
    setRemovingAdminId(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <MapPinCheckInside size={28} className="text-fuchsia-300/70 animate-pulse" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="font-display text-xl text-white mb-2">Not authorized</p>
          <p className="text-sm text-white/40 mb-6">This account doesn&apos;t have platform admin access.</p>
          <button type="button" onClick={handleSignOut} className="text-sm font-medium text-fuchsia-300 hover:underline">
            Sign out and try a different account
          </button>
        </div>
      </div>
    );
  }

  const totalEvents = events.length;
  const totalLeads = leads.length;
  const paidEvents = events.filter((e) => e.payment_status === "paid").length;
  const revenue = paidEvents * EVENT_PRICE_USD;

  const stats = [
    { label: "Organizations", value: orgs.length, icon: Building2 },
    { label: "Total Events", value: totalEvents, icon: Calendar },
    { label: "Total Leads", value: totalLeads, icon: Users2 },
    { label: "Revenue to date", value: `$${revenue.toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#2e0a30] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MapPinCheckInside size={22} className="text-fuchsia-300" />
            <div>
              <p className="font-display text-base leading-tight">EventPal</p>
              <p className="text-[11px] text-white/50 leading-tight">Platform Admin</p>
            </div>
          </div>
          <button type="button" onClick={handleSignOut} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-slate-900">All organizations</h1>
          <p className="text-slate-500 text-sm mt-0.5">Every business using EventPal, and how they&apos;re doing.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {loadingData
            ? Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            : stats.map((s, i) => (
                <Reveal key={s.label} index={i}>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: "#f5edf6" }}>
                      <s.icon size={16} style={{ color: "#610064" }} />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                </Reveal>
              ))}
        </div>
        {paidEvents === 0 && (
          <p className="text-xs text-slate-400 mb-6 -mt-2">
            Revenue reflects paid events only — billing isn&apos;t wired up yet, so this will start moving once it is.
          </p>
        )}

        {loadingData ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Building2 size={32} className="mx-auto mb-3 opacity-40" />
            <p>No organizations yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orgs.map((org, i) => {
              const orgEvents = events.filter((e) => e.organization_id === org.id);
              const orgLeads = leads.filter((l) => l.organization_id === org.id);
              const expanded = expandedOrgId === org.id;
              return (
                <Reveal key={org.id} index={i}>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-4 p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedOrgId(expanded ? null : org.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate flex items-center gap-2">
                          {org.name}
                          {org.is_suspended && (
                            <span className="text-[10px] uppercase font-bold tracking-wider text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                              Suspended
                            </span>
                          )}
                          {org.is_fee_exempt && (
                            <span className="text-[10px] uppercase font-bold tracking-wider text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                              Fee-exempt
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          /{org.slug} · joined {new Date(org.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyOrgId(org.id);
                          }}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 font-mono mt-0.5"
                          title="Copy full organization ID"
                        >
                          {copiedId === org.id ? <Check size={11} className="text-teal-600" /> : <Copy size={11} />}
                          ID: {org.id.slice(0, 8)}…
                        </button>
                      </div>
                    </button>
                    <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                      <span>{orgEvents.length} events</span>
                      <span>{orgLeads.length} leads</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFeeExempt(org)}
                      disabled={busyOrgId === org.id}
                      title={org.is_fee_exempt ? "Remove fee exemption" : "Exempt this org from the per-event fee"}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shrink-0 disabled:opacity-50 ${
                        org.is_fee_exempt
                          ? "border-teal-200 text-teal-700 hover:bg-teal-50"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {org.is_fee_exempt ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                      {org.is_fee_exempt ? "Remove exemption" : "Exempt from fees"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSuspend(org)}
                      disabled={busyOrgId === org.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shrink-0 disabled:opacity-50 ${
                        org.is_suspended
                          ? "border-teal-200 text-teal-700 hover:bg-teal-50"
                          : "border-rose-200 text-rose-700 hover:bg-rose-50"
                      }`}
                    >
                      {org.is_suspended ? <RotateCcw size={13} /> : <Ban size={13} />}
                      {org.is_suspended ? "Reactivate" : "Suspend"}
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                      {(org.email || org.phone) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3 pb-3 border-b border-slate-200">
                          {org.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail size={12} />
                              {org.email}
                            </span>
                          )}
                          {org.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone size={12} />
                              {org.phone}
                            </span>
                          )}
                        </div>
                      )}
                      {orgEvents.length === 0 ? (
                        <p className="text-xs text-slate-400">No events yet.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {orgEvents.map((ev) => {
                            const gate = getCaptureGate(windowFromEvent(ev), ev.timezone ?? undefined, ev.capture_override);
                            const busy = busyEventId === ev.id;
                            return (
                              <div key={ev.id} className="pb-2.5 border-b border-slate-200 last:border-0 last:pb-0">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-700 truncate">{ev.name}</span>
                                  <span className="flex items-center gap-3 text-slate-400 shrink-0">
                                    {new Date(ev.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full font-medium ${
                                        ev.payment_status === "paid" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"
                                      }`}
                                    >
                                      {ev.payment_status}
                                    </span>
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 mt-1.5">
                                  <span className={`flex items-center gap-1 text-[11px] font-medium ${gate.open ? "text-teal-600" : "text-slate-400"}`}>
                                    {gate.open ? <LockOpen size={11} /> : <Lock size={11} />}
                                    {gate.open
                                      ? "Accepting leads"
                                      : gate.reason === "manually_closed"
                                        ? "Closed by you"
                                        : gate.reason === "not_started"
                                          ? "Not open yet"
                                          : "Closed — ended"}
                                  </span>
                                  <div className="flex gap-0.5 bg-white rounded-md p-0.5 border border-slate-200 shrink-0">
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
                                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-60 ${
                                          (ev.capture_override ?? null) === value ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </Reveal>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <div className="mb-4">
            <h2 className="font-display text-xl text-slate-900">Platform admins</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              People with this same super-admin access, separate from any organization account.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="teammate@email.com"
                required
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] focus:border-transparent"
              />
              <button
                type="submit"
                disabled={addingAdmin}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white shrink-0 disabled:opacity-60 transition-transform active:scale-[0.97]"
                style={{ background: "#610064" }}
              >
                <UserPlus size={14} />
                {addingAdmin ? "Adding…" : "Add admin"}
              </button>
            </form>
            <p className="text-xs text-slate-400 mb-3">
              They need an existing Supabase Auth account first (e.g. they&apos;ve signed up as an organization, or
              you&apos;ve created one for them directly) — this just grants that account platform access.
            </p>

            {addAdminError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {addAdminError}
              </div>
            )}

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
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        added{" "}
                        {new Date(admin.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
        </div>
      </div>
    </div>
  );
}
