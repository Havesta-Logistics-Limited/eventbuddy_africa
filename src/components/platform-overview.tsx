"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Landmark,
  Mail,
  PencilLine,
  RefreshCw,
  ShieldAlert,
  Ticket,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users2,
  Wallet,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/billing";

/* ------------------------------------------------------------------ data */

type Pair = { cur: number; prev: number };
export type PlatformOverviewData = {
  days: number;
  include_test: boolean;
  generated_at: string;
  kpis: {
    sales_naira: Pair;
    paid_orders: Pair;
    revenue_naira: Pair;
    attendees: Pair;
    new_organizers: Pair;
    new_events: Pair;
    refunds_naira: number;
    disputes_naira: number;
  };
  money: {
    sold_naira: number;
    revenue_naira: number;
    paid_out_naira: number;
    paid_out_all_time_naira: number;
    held_organizers_naira: number;
    held_promoters_naira: number;
    held_funds_enabled: boolean;
  };
  inbox: {
    payouts_requested: number;
    payouts_requested_naira: number;
    payouts_stuck: number;
    payouts_failed: number;
    verifications_pending: number;
    risk_open: number;
    disputes_open: number;
    managed_new: number;
    bank_changes: number;
    name_changes: number;
    email_changes: number;
    deletions: number;
  };
  series: { day: string; sales_naira: number; revenue_naira: number; attendees: number }[];
  top_organizers: { id: string; name: string; verified: boolean; sales_naira: number; orders: number }[];
  upcoming: { id: string; name: string; slug: string | null; date: string; start_time: string | null; location: string | null; organization: string; attendees: number }[];
};

/** Where an Overview link sends the admin; the page maps it to a tab. */
export type OverviewTarget = "payouts" | "billing" | "billing-disputes" | "managed-requests" | "organizations" | "events";

/** Loads the Overview (migration 0121's platform_overview) and keeps it fresh:
 *  on mount, whenever the period or test toggle changes, every 2 minutes while
 *  the tab is visible, and on demand. The page also reads the inbox counts from
 *  it for the sidebar badges. */
export function usePlatformOverview(enabled: boolean) {
  const [days, setDays] = useState(30);
  const [includeTest, setIncludeTest] = useState(false);
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await createClient().rpc("platform_overview", { p_days: days, p_include_test: includeTest });
    setLoading(false);
    if (err) {
      setError(/function .*platform_overview|does not exist/i.test(err.message) ? "The Overview needs migration 0121 to be run on this database." : err.message);
      return;
    }
    setError(null);
    setData(res as PlatformOverviewData);
  }, [days, includeTest]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and when the period changes
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 120_000);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  return { data, error, loading, reload: load, days, setDays, includeTest, setIncludeTest };
}

/** Sidebar badge counts, per tab. */
export function overviewBadges(d: PlatformOverviewData | null): Partial<Record<string, number>> {
  if (!d) return {};
  const i = d.inbox;
  return {
    payouts: i.payouts_requested + i.payouts_stuck + i.payouts_failed + i.verifications_pending + i.risk_open,
    billing: i.disputes_open,
    "managed-requests": i.managed_new,
    organizations: i.bank_changes + i.name_changes + i.email_changes + i.deletions,
  };
}

/* ------------------------------------------------------------------ helpers */

const compactNaira = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(a >= 10_000_000_000 ? 0 : 1)}bn`;
  if (a >= 1_000_000) return `₦${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m`;
  if (a >= 10_000) return `₦${Math.round(n / 1000)}k`;
  return formatNaira(n);
};
const num = (n: number) => n.toLocaleString("en-NG");

function Delta({ cur, prev }: Pair) {
  if (prev === 0 && cur === 0) return <span className="po-delta po-delta--flat">No change</span>;
  if (prev === 0) return <span className="po-delta po-delta--up"><TrendingUp size={12} aria-hidden="true" /> New</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="po-delta po-delta--flat">No change</span>;
  const up = pct > 0;
  return (
    <span className={`po-delta ${up ? "po-delta--up" : "po-delta--down"}`}>
      {up ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

/* ------------------------------------------------------------------ chart */

type Metric = "sales_naira" | "revenue_naira" | "attendees";
const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: "sales_naira", label: "Sales", color: "#ff8af5" },
  { id: "revenue_naira", label: "eventbuddy revenue", color: "#a78bfa" },
  { id: "attendees", label: "Attendees", color: "#5eead4" },
];

function TrendChart({ series, metric }: { series: PlatformOverviewData["series"]; metric: Metric }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const color = METRICS.find((m) => m.id === metric)!.color;
  const W = 720;
  const H = 210;
  const pad = { t: 14, b: 26, l: 4, r: 4 };
  const values = series.map((s) => Number(s[metric]) || 0);
  const max = Math.max(1, ...values);
  const n = Math.max(1, series.length - 1);
  const x = (i: number) => pad.l + (i / n) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const fmt = (v: number) => (metric === "attendees" ? num(v) : formatNaira(v));
  const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short" });
  const ticks = [0, Math.floor(series.length / 2), series.length - 1].filter((v, i, a) => a.indexOf(v) === i && series[v]);
  const total = values.reduce((a, b) => a + b, 0);

  function onMove(e: React.PointerEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || series.length === 0) return;
    const rel = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1)))));
  }

  return (
    <div>
      <p className="text-xs text-muted">Total in this period</p>
      <p className="eb-kpi-value mt-0.5">{fmt(total)}</p>
      <div ref={ref} className="po-chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${METRICS.find((m) => m.id === metric)!.label} per day`}>
          <defs>
            <linearGradient id={`po-fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} className="po-grid" />
          ))}
          <path d={area} fill={`url(#po-fill-${metric})`} className="po-area" />
          <path d={line} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="po-line" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="po-cursor" />}
        </svg>
        {hover !== null && (
          <span className="po-dot" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(values[hover]) / H) * 100}%`, background: color }} aria-hidden="true" />
        )}
        {hover !== null && (
          <div className="po-tip" style={{ left: `${Math.min(86, Math.max(14, (x(hover) / W) * 100))}%` }}>
            <strong>{fmt(values[hover])}</strong>
            <span>{dayLabel(series[hover].day)}</span>
          </div>
        )}
        <div className="po-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${(x(t) / W) * 100}%` }}>{dayLabel(series[t].day)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ main */

export function PlatformOverview({
  overview,
  onNavigate,
}: {
  overview: ReturnType<typeof usePlatformOverview>;
  onNavigate: (target: OverviewTarget) => void;
}) {
  const { data, error, loading, reload, days, setDays, includeTest, setIncludeTest } = overview;
  const [metric, setMetric] = useState<Metric>("sales_naira");

  const inboxItems = useMemo(() => {
    if (!data) return [];
    const i = data.inbox;
    const items: { n: number; icon: typeof Wallet; title: string; sub: string; tone: "pink" | "amber" | "red" | "violet"; to: OverviewTarget }[] = [
      { n: i.payouts_requested, icon: Wallet, title: `${i.payouts_requested === 1 ? "Payout request" : "Payout requests"} to approve`, sub: `${formatNaira(i.payouts_requested_naira)} requested`, tone: "pink", to: "payouts" },
      { n: i.payouts_stuck, icon: Clock, title: "Payouts processing for over 48 hours", sub: "Check the transfer in Paystack", tone: "amber", to: "payouts" },
      { n: i.payouts_failed, icon: XCircle, title: "Failed payouts in the last 30 days", sub: "The money went back to their balance", tone: "red", to: "payouts" },
      { n: i.verifications_pending, icon: BadgeCheck, title: `${i.verifications_pending === 1 ? "Organizer" : "Organizers"} waiting for verification`, sub: "Review their ID and documents", tone: "violet", to: "payouts" },
      { n: i.risk_open, icon: ShieldAlert, title: `Open risk ${i.risk_open === 1 ? "alert" : "alerts"}`, sub: "Sales caps reached or sudden spikes", tone: "red", to: "payouts" },
      { n: i.disputes_open, icon: AlertTriangle, title: `Disputed ${i.disputes_open === 1 ? "payment" : "payments"}`, sub: "Chargebacks raised by buyers", tone: "amber", to: "billing-disputes" },
      { n: i.managed_new, icon: ClipboardList, title: `New managed-event ${i.managed_new === 1 ? "request" : "requests"}`, sub: "Organizers asking for our team", tone: "pink", to: "managed-requests" },
      { n: i.bank_changes, icon: Landmark, title: `Bank account ${i.bank_changes === 1 ? "change" : "changes"} to approve`, sub: "Check before money moves", tone: "amber", to: "organizations" },
      { n: i.name_changes, icon: PencilLine, title: `Organization name ${i.name_changes === 1 ? "change" : "changes"}`, sub: "Waiting for approval", tone: "violet", to: "organizations" },
      { n: i.email_changes, icon: Mail, title: `Login email ${i.email_changes === 1 ? "change" : "changes"}`, sub: "Waiting for approval", tone: "violet", to: "organizations" },
      { n: i.deletions, icon: Trash2, title: `Account deletion ${i.deletions === 1 ? "request" : "requests"}`, sub: "Waiting for approval", tone: "red", to: "organizations" },
    ];
    return items.filter((x) => x.n > 0);
  }, [data]);

  const updated = data ? new Date(data.generated_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="po">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="eb-app-title">Overview</h1>
          <p className="text-muted text-sm mt-0.5">Everything happening across eventbuddy{updated ? ` · updated ${updated}` : ""}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="po-seg" role="group" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
          <label className="po-switch">
            <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
            <span aria-hidden="true" />
            Test payments
          </label>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
            className="p-2 rounded-lg border border-line text-muted hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {!data && !error && <div className="po-skeleton" aria-busy="true" aria-label="Loading the overview" />}

      {data && (
        <>
          {/* ---- needs your action ---- */}
          <section className="po-card mb-6" aria-labelledby="po-inbox">
            <div className="flex items-center justify-between gap-3">
              <h2 id="po-inbox" className="po-h2">Needs your action</h2>
              {inboxItems.length > 0 && <span className="po-count">{inboxItems.reduce((a, b) => a + b.n, 0)}</span>}
            </div>
            {inboxItems.length === 0 ? (
              <p className="po-clear">
                <CheckCircle2 size={18} aria-hidden="true" /> All clear. Nothing is waiting on you.
              </p>
            ) : (
              <ul className="po-inbox">
                {inboxItems.map((it) => (
                  <li key={it.title}>
                    <button type="button" className={`po-inbox-item po-tone--${it.tone}`} onClick={() => onNavigate(it.to)}>
                      <span className="po-inbox-icon"><it.icon size={17} aria-hidden="true" /></span>
                      <span className="po-inbox-n">{num(it.n)}</span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium text-fg">{it.title}</span>
                        <span className="block truncate text-xs text-muted">{it.sub}</span>
                      </span>
                      <ArrowRight size={15} className="po-inbox-go" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- headline numbers ---- */}
          <div className="po-kpis mb-6">
            {[
              { label: "Ticket and stand sales", value: compactNaira(data.kpis.sales_naira.cur), full: formatNaira(data.kpis.sales_naira.cur), pair: data.kpis.sales_naira, icon: Ticket, k: "#ff8af5" },
              { label: "eventbuddy revenue", value: compactNaira(data.kpis.revenue_naira.cur), full: formatNaira(data.kpis.revenue_naira.cur), pair: data.kpis.revenue_naira, icon: Banknote, k: "#a78bfa" },
              { label: "Paid orders", value: num(data.kpis.paid_orders.cur), pair: data.kpis.paid_orders, icon: Wallet, k: "#f9a8d4" },
              { label: "Attendees registered", value: num(data.kpis.attendees.cur), pair: data.kpis.attendees, icon: Users2, k: "#5eead4" },
              { label: "New organizers", value: num(data.kpis.new_organizers.cur), pair: data.kpis.new_organizers, icon: UserPlus, k: "#93c5fd" },
              { label: "New events", value: num(data.kpis.new_events.cur), pair: data.kpis.new_events, icon: Calendar, k: "#fcd34d" },
            ].map((t) => (
              <div key={t.label} className="eb-kpi" style={{ ["--k" as string]: t.k }} title={t.full}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="eb-kpi-icon"><t.icon size={16} aria-hidden="true" /></div>
                  <Delta {...t.pair} />
                </div>
                <p className="eb-kpi-value">{t.value}</p>
                <p className="mt-0.5 text-xs text-muted">{t.label}</p>
              </div>
            ))}
          </div>

          {/* ---- money flow ---- */}
          <section className="po-card mb-6" aria-labelledby="po-money">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="po-money" className="po-h2">Where the money is</h2>
              <p className="text-xs text-muted">Last {data.days} days, and held right now</p>
            </div>
            <div className="po-flow">
              <div className="po-flow-step">
                <p className="po-flow-label">Sold</p>
                <p className="po-flow-value">{formatNaira(data.money.sold_naira)}</p>
                <p className="po-flow-sub">tickets and stands</p>
              </div>
              <ArrowRight className="po-flow-arrow" size={18} aria-hidden="true" />
              <div className="po-flow-step po-flow-step--rev">
                <p className="po-flow-label">eventbuddy revenue</p>
                <p className="po-flow-value">{formatNaira(data.money.revenue_naira)}</p>
                <p className="po-flow-sub">fees, publishing and plans</p>
              </div>
              <ArrowRight className="po-flow-arrow" size={18} aria-hidden="true" />
              <div className="po-flow-step po-flow-step--held">
                <p className="po-flow-label">Held right now</p>
                {/* the total is the sum of the rounded parts shown under it, so the figures always add up */}
                <p className="po-flow-value">{formatNaira(Math.round(data.money.held_organizers_naira) + Math.round(data.money.held_promoters_naira))}</p>
                <p className="po-flow-sub">
                  {formatNaira(data.money.held_organizers_naira)} organizers · {formatNaira(data.money.held_promoters_naira)} promoters
                </p>
              </div>
              <ArrowRight className="po-flow-arrow" size={18} aria-hidden="true" />
              <div className="po-flow-step po-flow-step--out">
                <p className="po-flow-label">Paid out</p>
                <p className="po-flow-value">{formatNaira(data.money.paid_out_naira)}</p>
                <p className="po-flow-sub">{formatNaira(data.money.paid_out_all_time_naira)} all time</p>
              </div>
            </div>
            {(data.kpis.refunds_naira > 0 || data.kpis.disputes_naira > 0) && (
              <p className="mt-3 text-xs text-muted">
                Includes {formatNaira(data.kpis.refunds_naira)} refunded and {formatNaira(data.kpis.disputes_naira)} disputed in this period.
              </p>
            )}
            {!data.money.held_funds_enabled && (
              <p className="mt-3 text-xs text-amber-300">Held funds are off: ticket money goes straight to organizers&apos; banks, so only sales made while it was on are held.</p>
            )}
          </section>

          {/* ---- trend ---- */}
          <section className="po-card mb-6" aria-labelledby="po-trend">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="po-trend" className="po-h2">Day by day</h2>
              <div className="po-seg" role="group" aria-label="Chart">
                {METRICS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <TrendChart series={data.series} metric={metric} />
          </section>

          {/* ---- organizers and this week ---- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="po-card" aria-labelledby="po-top">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="po-top" className="po-h2">Top organizers</h2>
                <button type="button" className="po-link" onClick={() => onNavigate("organizations")}>
                  All organizations <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
              {data.top_organizers.length === 0 ? (
                <p className="po-empty">No sales in this period yet.</p>
              ) : (
                <ol className="po-rows">
                  {data.top_organizers.map((o, i) => {
                    const share = data.top_organizers[0].sales_naira > 0 ? (o.sales_naira / data.top_organizers[0].sales_naira) * 100 : 0;
                    return (
                      <li key={o.id} className="po-row">
                        <span className="po-rank">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
                            <span className="truncate">{o.name}</span>
                            {o.verified && <BadgeCheck size={14} className="shrink-0 text-emerald-300" aria-label="Verified" />}
                          </span>
                          <span className="po-bar"><span style={{ width: `${Math.max(4, share)}%` }} /></span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-semibold tabular-nums text-fg">{formatNaira(o.sales_naira)}</span>
                          <span className="block text-xs text-muted">{num(o.orders)} {o.orders === 1 ? "order" : "orders"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="po-card" aria-labelledby="po-week">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="po-week" className="po-h2">Happening in the next 7 days</h2>
                <button type="button" className="po-link" onClick={() => onNavigate("events")}>
                  All events <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
              {data.upcoming.length === 0 ? (
                <p className="po-empty">No published events in the next 7 days.</p>
              ) : (
                <ul className="po-rows">
                  {data.upcoming.map((e) => {
                    const d = new Date(e.date + "T12:00:00");
                    return (
                      <li key={e.id} className="po-row">
                        <span className="po-date">
                          <strong>{d.getDate()}</strong>
                          <span>{d.toLocaleDateString("en-NG", { month: "short" })}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{e.name}</span>
                          <span className="block truncate text-xs text-muted">
                            <Building2 size={11} className="mr-1 inline -translate-y-px" aria-hidden="true" />
                            {e.organization}
                            {e.location ? ` · ${e.location}` : ""}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-semibold tabular-nums text-fg">{num(e.attendees)}</span>
                          <span className="block text-xs text-muted">attendees</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
