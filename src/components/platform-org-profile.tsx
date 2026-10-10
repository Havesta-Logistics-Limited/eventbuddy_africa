"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Landmark,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Store,
  Ticket,
  UserPlus,
  Users2,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/billing";

type Profile = {
  org: {
    id: string; name: string; slug: string | null; created_at: string; email: string | null; phone: string | null; bio: string | null; logo_url: string | null;
    login_email: string | null; last_sign_in_at: string | null; suspended: boolean; fee_exempt: boolean; verified: boolean; verified_at: string | null;
    plan: string | null; plan_status: string | null; plan_comped: boolean; plan_period_end: string | null;
    bank_name: string | null; account_name: string | null; account_last4: string; bank_change_status: string; members: number;
  };
  stats: {
    sales_naira: number; orders: number; revenue_naira: number; refunds_naira: number; disputes: number; attendees: number; checked_in: number;
    events: number; events_published: number; events_upcoming: number; first_sale_at: string | null; last_sale_at: string | null;
  };
  balance: { total: number; pending: number; locked: number; available: number; paid_out: number } | null;
  events: { id: string; name: string; slug: string | null; date: string; published: boolean; location: string | null; tour: boolean; promoters: boolean; exhibitors: boolean; attendees: number; checked_in: number; sales_naira: number }[];
  payouts: { id: string; amount_naira: number; fee_naira: number; status: string; requested_at: string; decided_at: string | null; paid_at: string | null; bank_name: string | null; account_number_last4: string | null; failure_reason: string | null; decision_note: string | null }[];
  verification: { status: string; full_name: string; business_name: string | null; id_type: string; cac_number: string | null; created_at: string; decided_at: string | null; decline_reason: string | null } | null;
  risk: { id: string; kind: string; tickets: number; created_at: string; resolved_at: string | null; event: string | null }[];
  promoters: { id: string; handle: string; full_name: string | null; orders: number; sales_naira: number }[];
  exhibitors: { total: number; confirmed: number; pending: number; stand_sales_naira: number };
  timeline: { at: string; kind: string; title: string; detail: string | null }[];
};

type Tab = "activity" | "events" | "money" | "partners";

const day = (d: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ago = (d: string | null) => {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return day(d);
};
const n = (v: number) => Number(v).toLocaleString("en-NG");
const PLAN: Record<string, string> = { launch: "Launch", grow: "Grow", scale: "Scale" };
const ID_TYPE: Record<string, string> = { nin: "NIN", drivers_licence: "Driver's licence", passport: "Passport", voters_card: "Voter's card" };

const TIMELINE_ICON: Record<string, { icon: typeof Ticket; tone: string }> = {
  joined: { icon: UserPlus, tone: "violet" },
  event: { icon: Calendar, tone: "pink" },
  first_sale: { icon: Sparkles, tone: "green" },
  refund: { icon: RotateCcw, tone: "amber" },
  payout: { icon: Wallet, tone: "violet" },
  payout_paid: { icon: CheckCircle2, tone: "green" },
  payout_failed: { icon: XCircle, tone: "red" },
  payout_rejected: { icon: XCircle, tone: "red" },
  payout_cancelled: { icon: XCircle, tone: "muted" },
  verification: { icon: BadgeCheck, tone: "violet" },
  verification_approved: { icon: BadgeCheck, tone: "green" },
  verification_declined: { icon: XCircle, tone: "red" },
  risk: { icon: ShieldAlert, tone: "red" },
};

/**
 * One organizer, everything about them (migration 0122's platform_org_profile):
 * account, lifetime numbers, balance, events, payouts, verification, risk,
 * promoters and exhibitors, and a timeline. A panel over the portal; read-only,
 * with a link to the Organizations tab for actions.
 */
export function PlatformOrgProfile({
  orgId,
  includeTest,
  onClose,
  onManage,
}: {
  orgId: string | null;
  includeTest: boolean;
  onClose: () => void;
  onManage: (orgName: string) => void;
}) {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("activity");

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when a different organizer opens
    setData(null);
    setError(null);
    setTab("activity");
    createClient()
      .rpc("platform_org_profile", { p_org: orgId, p_include_test: includeTest })
      .then(({ data: res, error: err }) => {
        if (cancelled) return;
        if (err) setError(/platform_org_profile|does not exist/i.test(err.message) ? "Profiles need migration 0122 to be run on this database." : err.message);
        else if (!res) setError("This organizer no longer exists.");
        else setData(res as Profile);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, includeTest]);

  useEffect(() => {
    if (!orgId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [orgId, onClose]);

  if (!orgId) return null;
  const o = data?.org;
  const s = data?.stats;

  return (
    <div className="op-wrap" role="dialog" aria-modal="true" aria-label={o ? `${o.name}, organizer profile` : "Organizer profile"}>
      <button type="button" className="op-backdrop" aria-label="Close profile" onClick={onClose} />
      <aside className="op-panel">
        <div className="op-head">
          <div className="flex min-w-0 items-center gap-3">
            <span className="op-avatar">
              {o?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logo_url} alt="" />
              ) : (
                (o?.name ?? "·").charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-lg font-semibold text-fg">
                <span className="truncate">{o?.name ?? "Loading…"}</span>
                {o?.verified && <BadgeCheck size={17} className="shrink-0 text-emerald-300" aria-label="Verified" />}
              </p>
              {o && (
                <p className="truncate text-xs text-muted">
                  Joined {day(o.created_at)} · last signed in {ago(o.last_sign_in_at)}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="op-close" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="op-body">
          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          {!data && !error && <div className="op-skeleton" aria-busy="true" aria-label="Loading" />}

          {data && o && s && (
            <>
              {/* status chips */}
              <div className="flex flex-wrap gap-1.5">
                {o.suspended ? <span className="op-chip op-chip--red"><Ban size={12} aria-hidden="true" /> Suspended</span> : <span className="op-chip op-chip--green">Active</span>}
                {o.verified ? <span className="op-chip op-chip--green"><BadgeCheck size={12} aria-hidden="true" /> Verified {o.verified_at ? day(o.verified_at) : ""}</span> : <span className="op-chip">Not verified · sales limit applies</span>}
                <span className="op-chip op-chip--violet">{PLAN[o.plan ?? ""] ?? o.plan ?? "Launch"} plan{o.plan_comped ? " · comped" : ""}{o.plan_status && o.plan_status !== "active" ? ` · ${o.plan_status}` : ""}</span>
                {o.fee_exempt && <span className="op-chip op-chip--amber">Fee exempt</span>}
                {o.bank_change_status === "requested" && <span className="op-chip op-chip--amber">Bank change waiting</span>}
              </div>

              {/* contact */}
              <div className="op-contact">
                {o.email && <a href={`mailto:${o.email}`}><Mail size={13} aria-hidden="true" /> {o.email}</a>}
                {o.login_email && o.login_email !== o.email && <span><Mail size={13} aria-hidden="true" /> {o.login_email} <em>(login)</em></span>}
                {o.phone && <a href={`tel:${o.phone}`}><Phone size={13} aria-hidden="true" /> {o.phone}</a>}
                {o.bank_name && <span><Landmark size={13} aria-hidden="true" /> {o.bank_name}{o.account_last4 ? ` ••${o.account_last4}` : ""}{o.account_name ? ` · ${o.account_name}` : ""}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {o.slug && (
                  <a className="op-btn" href={`/${o.slug}`} target="_blank" rel="noopener noreferrer">
                    Public page <ExternalLink size={13} aria-hidden="true" />
                  </a>
                )}
                <button type="button" className="op-btn" onClick={() => onManage(o.name)}>
                  Manage in Organizations <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              </div>

              {/* numbers */}
              <div className="op-stats">
                <div><p className="op-stat-v">{formatNaira(s.sales_naira)}</p><p className="op-stat-l">Lifetime sales · {n(s.orders)} orders</p></div>
                <div><p className="op-stat-v">{formatNaira(s.revenue_naira)}</p><p className="op-stat-l">eventbuddy revenue</p></div>
                <div><p className="op-stat-v">{n(s.attendees)}</p><p className="op-stat-l">Attendees · {n(s.checked_in)} checked in</p></div>
                <div><p className="op-stat-v">{n(s.events)}</p><p className="op-stat-l">Events · {n(s.events_upcoming)} upcoming</p></div>
              </div>

              {/* tabs */}
              <div className="op-tabs" role="tablist" aria-label="Profile sections">
                {([
                  ["activity", "Activity"],
                  ["events", `Events (${data.events.length})`],
                  ["money", "Money"],
                  ["partners", "Promoters & exhibitors"],
                ] as [Tab, string][]).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === "activity" && (
                <div className="space-y-4">
                  {data.risk.some((r) => !r.resolved_at) && (
                    <p className="op-alert">
                      <ShieldAlert size={15} aria-hidden="true" /> {data.risk.filter((r) => !r.resolved_at).length} open risk {data.risk.filter((r) => !r.resolved_at).length === 1 ? "alert" : "alerts"}: review on the Payouts tab.
                    </p>
                  )}
                  {data.verification && (
                    <div className="op-box">
                      <p className="op-box-h">Verification</p>
                      <p className="text-sm text-fg">
                        {data.verification.status === "approved" ? "Approved" : data.verification.status === "declined" ? "Declined" : "Waiting for review"} · {data.verification.full_name}
                        {data.verification.business_name ? ` · ${data.verification.business_name}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        {ID_TYPE[data.verification.id_type] ?? data.verification.id_type}
                        {data.verification.cac_number ? ` · CAC ${data.verification.cac_number}` : ""} · sent {day(data.verification.created_at)}
                        {data.verification.decline_reason ? ` · “${data.verification.decline_reason}”` : ""}
                      </p>
                    </div>
                  )}
                  <ol className="op-timeline">
                    {data.timeline.map((t, i) => {
                      const ic = TIMELINE_ICON[t.kind] ?? { icon: Clock, tone: "muted" };
                      return (
                        <li key={i} className={`op-tl op-tone--${ic.tone}`}>
                          <span className="op-tl-dot"><ic.icon size={13} aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <p className="text-sm text-fg">{t.title}{t.detail ? <span className="text-muted"> · {t.detail}</span> : null}</p>
                            <p className="text-xs text-subtle">{day(t.at)} · {ago(t.at)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {tab === "events" && (
                data.events.length === 0 ? <p className="op-empty">No events yet.</p> : (
                  <ul className="op-list">
                    {data.events.map((e) => (
                      <li key={e.id} className="op-row">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                            <span className="truncate">{e.name}</span>
                            {!e.published && <span className="op-chip">Draft</span>}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {day(e.date)}{e.location ? <> · <MapPin size={11} className="inline -translate-y-px" aria-hidden="true" /> {e.location}</> : null}
                            {e.tour ? " · tour" : ""}{e.promoters ? " · promoters" : ""}{e.exhibitors ? " · exhibitors" : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-fg">{formatNaira(e.sales_naira)}</p>
                          <p className="text-xs text-muted">{n(e.attendees)} attendees · {n(e.checked_in)} in</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === "money" && (
                <div className="space-y-4">
                  {data.balance && (
                    <div className="op-stats op-stats--4">
                      <div><p className="op-stat-v">{formatNaira(data.balance.available)}</p><p className="op-stat-l">Available to withdraw</p></div>
                      <div><p className="op-stat-v">{formatNaira(data.balance.pending)}</p><p className="op-stat-l">Clearing</p></div>
                      <div><p className="op-stat-v">{formatNaira(data.balance.locked)}</p><p className="op-stat-l">Locked until after the event</p></div>
                      <div><p className="op-stat-v">{formatNaira(data.balance.paid_out)}</p><p className="op-stat-l">Paid out so far</p></div>
                    </div>
                  )}
                  {(s.refunds_naira > 0 || s.disputes > 0) && (
                    <p className="op-alert op-alert--amber">
                      <RotateCcw size={15} aria-hidden="true" /> {formatNaira(s.refunds_naira)} refunded · {n(s.disputes)} disputed {s.disputes === 1 ? "payment" : "payments"}
                    </p>
                  )}
                  <div>
                    <p className="op-box-h">Payouts</p>
                    {data.payouts.length === 0 ? <p className="op-empty">No payout requests yet.</p> : (
                      <ul className="op-list">
                        {data.payouts.map((p) => (
                          <li key={p.id} className="op-row">
                            <span className={`op-status op-status--${p.status}`}>{p.status}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium tabular-nums text-fg">{formatNaira(p.amount_naira)}</p>
                              <p className="truncate text-xs text-muted">
                                {p.bank_name ?? "Bank"}{p.account_number_last4 ? ` ••${p.account_number_last4}` : ""} · asked {day(p.requested_at)}
                                {p.paid_at ? ` · paid ${day(p.paid_at)}` : ""}{p.failure_reason ? ` · ${p.failure_reason}` : ""}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="text-xs text-subtle">
                    <CreditCard size={12} className="mr-1 inline -translate-y-px" aria-hidden="true" />
                    First sale {day(s.first_sale_at)} · latest sale {ago(s.last_sale_at)}
                  </p>
                </div>
              )}

              {tab === "partners" && (
                <div className="space-y-5">
                  <div>
                    <p className="op-box-h"><Megaphone size={13} className="mr-1 inline -translate-y-px" aria-hidden="true" /> Promoters selling their events</p>
                    {data.promoters.length === 0 ? <p className="op-empty">No promoters yet.</p> : (
                      <ul className="op-list">
                        {data.promoters.map((p) => (
                          <li key={p.id} className="op-row">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-fg">@{p.handle}</p>
                              {p.full_name && <p className="truncate text-xs text-muted">{p.full_name}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold tabular-nums text-fg">{formatNaira(p.sales_naira)}</p>
                              <p className="text-xs text-muted">{n(p.orders)} {p.orders === 1 ? "sale" : "sales"}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="op-box-h"><Store size={13} className="mr-1 inline -translate-y-px" aria-hidden="true" /> Exhibitors</p>
                    <div className="op-stats op-stats--4">
                      <div><p className="op-stat-v">{n(data.exhibitors.total)}</p><p className="op-stat-l">Applications</p></div>
                      <div><p className="op-stat-v">{n(data.exhibitors.confirmed)}</p><p className="op-stat-l">Confirmed stands</p></div>
                      <div><p className="op-stat-v">{n(data.exhibitors.pending)}</p><p className="op-stat-l">Waiting</p></div>
                      <div><p className="op-stat-v">{formatNaira(data.exhibitors.stand_sales_naira)}</p><p className="op-stat-l">Stand sales</p></div>
                    </div>
                  </div>
                  <p className="text-xs text-subtle"><Users2 size={12} className="mr-1 inline -translate-y-px" aria-hidden="true" /> {n(o.members)} team {o.members === 1 ? "member" : "members"} besides the owner</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
