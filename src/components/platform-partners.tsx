"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Map as MapIcon,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Ticket,
  Users2,
  Wallet,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/billing";
import { CRON_JOBS } from "@/lib/cron-jobs";

/* ------------------------------------------------------------------ shared */

const n = (v: number) => Number(v || 0).toLocaleString("en-NG");
const day = (d: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ago = (d: string | null) => {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const missing = (msg: string) => (/does not exist|function public\.platform_|relation .*cron_runs/i.test(msg) ? "This tab needs migration 0123 to be run on this database." : msg);

function useRpc<T>(fn: string, args: Record<string, unknown>, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(args);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await createClient().rpc(fn, JSON.parse(key));
    setLoading(false);
    if (err) return setError(missing(err.message));
    setError(null);
    setData(res as T);
  }, [fn, key]);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and when the arguments change
    load();
  }, [enabled, load]);
  return { data, error, loading, reload: load };
}

function Header({ title, sub, loading, onRefresh }: { title: string; sub: string; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="eb-app-title">{title}</h1>
        <p className="mt-0.5 text-sm text-muted">{sub}</p>
      </div>
      <button type="button" onClick={onRefresh} disabled={loading} title="Refresh" aria-label="Refresh" className="shrink-0 rounded-lg border border-line p-2 text-muted hover:bg-canvas disabled:opacity-50">
        <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
      </button>
    </div>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mb-6 flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
    </p>
  );
}

function Tiles({ items }: { items: { label: string; value: string; icon: typeof Ticket; k: string }[] }) {
  return (
    <div className="pp-tiles mb-6">
      {items.map((t) => (
        <div key={t.label} className="eb-kpi" style={{ ["--k" as string]: t.k }}>
          <div className="eb-kpi-icon mb-2"><t.icon size={16} aria-hidden="true" /></div>
          <p className="eb-kpi-value">{t.value}</p>
          <p className="mt-0.5 text-xs text-muted">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

function Filter({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="pp-search">
        <Search size={15} aria-hidden="true" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="po-empty px-1">{children}</p>;

/* ------------------------------------------------------------------ promoters */

type PromoterRow = {
  id: string; handle: string; full_name: string | null; email: string | null; phone: string | null; suspended: boolean; created_at: string;
  bank_name: string | null; account_last4: string; bank_change_waiting: boolean; events: number; clicks: number; orders: number;
  sales_naira: number; last_sale_at: string | null; commission_naira: number; balance_naira: number; paid_out_naira: number; badge: string | null;
};
const BADGE: Record<string, string> = { starter: "Starter", seller: "Seller", reliable: "Reliable", captain: "Captain" };

export function PromotersTab({ includeTest }: { includeTest: boolean }) {
  const { data, error, loading, reload } = useRpc<{ summary: Record<string, number>; promoters: PromoterRow[] }>("platform_promoters", { p_include_test: includeTest });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.promoters ?? []).filter((p) => !t || [p.handle, p.full_name, p.email, p.phone].some((v) => v?.toLowerCase().includes(t)));
  }, [data, q]);

  async function toggleSuspend(p: PromoterRow) {
    const next = !p.suspended;
    if (next && !window.confirm(`Suspend @${p.handle}? Their links stop earning commission and they can't join new events until you unsuspend them.`)) return;
    setBusy(p.id);
    const { error: err } = await createClient().from("promoters").update({ is_suspended: next }).eq("id", p.id);
    setBusy(null);
    if (err) return toast.error("Couldn't update the promoter.");
    toast.success(next ? `@${p.handle} suspended` : `@${p.handle} can sell again`);
    reload();
  }

  const s = data?.summary;
  return (
    <>
      <Header title="Promoters" sub="Everyone selling tickets on commission, what they've sold and what they're owed." loading={loading} onRefresh={reload} />
      <ErrorNote error={error} />
      {s && (
        <Tiles
          items={[
            { label: "Promoters", value: n(s.promoters), icon: Megaphone, k: "#ff8af5" },
            { label: "Have made a sale", value: n(s.active_selling), icon: Ticket, k: "#5eead4" },
            { label: "Tickets sold through them", value: formatNaira(s.sales_naira), icon: Wallet, k: "#a78bfa" },
            { label: "Commission earned", value: formatNaira(s.commission_naira), icon: BadgeCheck, k: "#fcd34d" },
            { label: "Owed to promoters now", value: formatNaira(s.owed_naira), icon: Clock, k: "#93c5fd" },
          ]}
        />
      )}
      <div className="po-card">
        <Filter value={q} onChange={setQ} placeholder="Search by handle, name, email or phone" />
        {data && rows.length === 0 && <Empty>{q ? "No promoter matches that." : "No promoters yet."}</Empty>}
        <ul className="pp-list">
          {rows.map((p) => (
            <li key={p.id} className="pp-row">
              <div className="pp-main">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                  @{p.handle}
                  {p.badge && <span className="op-chip op-chip--violet">{BADGE[p.badge] ?? p.badge}</span>}
                  {p.suspended && <span className="op-chip op-chip--red">Suspended</span>}
                  {p.bank_change_waiting && <span className="op-chip op-chip--amber">Bank change waiting</span>}
                </p>
                <p className="truncate text-xs text-muted">{[p.full_name, p.email, p.phone].filter(Boolean).join(" · ")}</p>
                <p className="truncate text-xs text-subtle">
                  Joined {day(p.created_at)} · {n(p.events)} {p.events === 1 ? "event" : "events"} · <MousePointerClick size={11} className="inline -translate-y-px" aria-hidden="true" /> {n(p.clicks)} clicks
                  {p.bank_name ? ` · ${p.bank_name} ••${p.account_last4}` : " · no bank account yet"}
                </p>
              </div>
              <div className="pp-nums">
                <div><p>{formatNaira(p.sales_naira)}</p><span>{n(p.orders)} sold · {ago(p.last_sale_at)}</span></div>
                <div><p>{formatNaira(p.commission_naira)}</p><span>commission</span></div>
                <div><p>{formatNaira(p.balance_naira)}</p><span>owed · {formatNaira(p.paid_out_naira)} paid</span></div>
              </div>
              <button type="button" disabled={busy === p.id} onClick={() => toggleSuspend(p)} className={`pp-act ${p.suspended ? "" : "pp-act--danger"}`}>
                {p.suspended ? "Unsuspend" : "Suspend"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ exhibitors */

type ExhibitorRow = {
  id: string; company_name: string; contact_name: string | null; email: string | null; phone: string | null; category: string | null; status: string;
  stand_label: string | null; amount_naira: number; applied_at: string; paid_at: string | null; listed: boolean; data_removed: boolean; stand_type: string | null;
  event_id: string; event: string; event_date: string; organization_id: string; organization: string; leads: number; passes: number;
};
const EX_STATUS: Record<string, { label: string; tone: string }> = {
  applied: { label: "Waiting for organizer", tone: "amber" },
  approved: { label: "Awaiting payment", tone: "violet" },
  paid: { label: "Confirmed", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "" },
};

export function ExhibitorsTab({ onOpenOrg }: { onOpenOrg: (orgId: string) => void }) {
  const { data, error, loading, reload } = useRpc<{ summary: Record<string, number>; exhibitors: ExhibitorRow[] }>("platform_exhibitors", {});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.exhibitors ?? []).filter(
      (x) => (status === "all" || x.status === status) && (!t || [x.company_name, x.contact_name, x.email, x.event, x.organization].some((v) => v?.toLowerCase().includes(t)))
    );
  }, [data, q, status]);
  const s = data?.summary;
  return (
    <>
      <Header title="Exhibitors" sub="Every stand booked across every event: who, where, paid or not, and the leads they collected." loading={loading} onRefresh={reload} />
      <ErrorNote error={error} />
      {s && (
        <Tiles
          items={[
            { label: `Applications · ${n(s.events)} events`, value: n(s.total), icon: Store, k: "#ff8af5" },
            { label: "Waiting for organizers", value: n(s.waiting), icon: Clock, k: "#fcd34d" },
            { label: "Awaiting payment", value: n(s.awaiting_payment), icon: Wallet, k: "#a78bfa" },
            { label: "Confirmed stands", value: n(s.confirmed), icon: CheckCircle2, k: "#5eead4" },
            { label: `Stand sales · ${n(s.leads)} leads`, value: formatNaira(s.stand_sales_naira), icon: Ticket, k: "#93c5fd" },
          ]}
        />
      )}
      <div className="po-card">
        <Filter value={q} onChange={setQ} placeholder="Search company, contact, event or organizer">
          <div className="po-seg" role="group" aria-label="Status">
            {[["all", "All"], ["applied", "Waiting"], ["approved", "Unpaid"], ["paid", "Confirmed"]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}>{label}</button>
            ))}
          </div>
        </Filter>
        {data && rows.length === 0 && <Empty>{q || status !== "all" ? "No exhibitor matches that." : "No exhibitor applications yet."}</Empty>}
        <ul className="pp-list">
          {rows.map((x) => {
            const st = EX_STATUS[x.status] ?? { label: x.status, tone: "" };
            return (
              <li key={x.id} className="pp-row">
                <div className="pp-main">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                    {x.company_name}
                    <span className={`op-chip ${st.tone ? `op-chip--${st.tone}` : ""}`}>{st.label}</span>
                    {x.data_removed && <span className="op-chip">Data removed</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{[x.contact_name, x.email, x.phone, x.category].filter(Boolean).join(" · ")}</p>
                  <p className="truncate text-xs text-subtle">
                    {x.event} · {day(x.event_date)} ·{" "}
                    <button type="button" className="pp-orglink" onClick={() => onOpenOrg(x.organization_id)}>{x.organization}</button>
                  </p>
                </div>
                <div className="pp-nums">
                  <div><p>{x.stand_label ? `Stand ${x.stand_label}` : "—"}</p><span>{x.stand_type ?? "stand"}</span></div>
                  <div><p>{Number(x.amount_naira) > 0 ? formatNaira(x.amount_naira) : "Free"}</p><span>{x.paid_at ? `paid ${day(x.paid_at)}` : `applied ${day(x.applied_at)}`}</span></div>
                  <div><p>{n(x.leads)}</p><span>leads · {n(x.passes)} passes</span></div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ tours */

type TourRow = {
  id: string; name: string; slug: string; created_at: string; organization_id: string; organization: string; organization_slug: string | null;
  cities: number; published: number; next_date: string | null; last_date: string | null; attendees: number; sales_naira: number;
  stops: { name: string; location: string | null; date: string; published: boolean }[];
};

export function ToursTab({ includeTest, onOpenOrg }: { includeTest: boolean; onOpenOrg: (orgId: string) => void }) {
  const { data, error, loading, reload } = useRpc<TourRow[]>("platform_tours", { p_include_test: includeTest });
  const tours = data ?? [];
  return (
    <>
      <Header title="Tours" sub="The same event across several cities, with every stop's date and how each tour is selling." loading={loading} onRefresh={reload} />
      <ErrorNote error={error} />
      {data && (
        <Tiles
          items={[
            { label: "Tours", value: n(tours.length), icon: MapIcon, k: "#ff8af5" },
            { label: "Cities in total", value: n(tours.reduce((a, t) => a + Number(t.cities), 0)), icon: Store, k: "#a78bfa" },
            { label: "Tour tickets sold", value: formatNaira(tours.reduce((a, t) => a + Number(t.sales_naira), 0)), icon: Ticket, k: "#5eead4" },
            { label: "Tour attendees", value: n(tours.reduce((a, t) => a + Number(t.attendees), 0)), icon: Users2, k: "#93c5fd" },
          ]}
        />
      )}
      {data && tours.length === 0 && <div className="po-card"><Empty>No tours yet. They appear here when an organizer runs the same event in more than one city.</Empty></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {tours.map((t) => (
          <section key={t.id} className="po-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-fg">{t.name}</p>
                <button type="button" className="pp-orglink text-xs" onClick={() => onOpenOrg(t.organization_id)}>{t.organization}</button>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-fg">{formatNaira(t.sales_naira)}</p>
                <p className="text-xs text-muted">{n(t.attendees)} attendees</p>
              </div>
            </div>
            <ol className="pp-stops">
              {t.stops.map((s, i) => {
                const past = s.date < new Date().toISOString().slice(0, 10);
                return (
                  <li key={i} data-past={past || undefined}>
                    <span className="pp-stop-dot" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.location || s.name}</span>
                    <span className="text-xs tabular-nums text-muted">{day(s.date)}</span>
                    {!s.published && <span className="op-chip">Draft</span>}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-subtle">
              {n(t.published)} of {n(t.cities)} cities live · {t.next_date ? `next stop ${day(t.next_date)}` : "no upcoming stops"}
              {t.organization_slug ? (
                <>
                  {" · "}
                  <a className="pp-orglink" href={`/${t.organization_slug}/tours/${t.slug}`} target="_blank" rel="noopener noreferrer">tour page</a>
                </>
              ) : null}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ risk */

type RiskRow = {
  id: string; kind: string; tickets: number; created_at: string; resolved_at: string | null; organization_id: string;
  organizations: { name: string; email: string | null; payout_verified: boolean; created_at: string } | null;
  events: { name: string } | null;
};
const RISK_LABEL: Record<string, string> = { cap_near: "Close to the sales limit", cap_reached: "Hit the sales limit, sales paused", sales_spike: "Sudden spike in sales" };

export function RiskTab({ onOpenOrg, onChanged }: { onOpenOrg: (orgId: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<RiskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data, error: err } = await createClient()
      .from("risk_alerts")
      .select("id, kind, tickets, created_at, resolved_at, organization_id, organizations(name, email, payout_verified, created_at), events(name)")
      .or(`resolved_at.is.null,created_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (err) return setError(err.message);
    setError(null);
    setRows((data ?? []) as unknown as RiskRow[]);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  async function resolve(orgId: string, verify: boolean) {
    if (verify && !window.confirm("Verify this organizer? Their sales limit is lifted and they can take early payouts. Only do this once you've checked the event is real.")) return;
    setBusy(orgId);
    if (verify) {
      const res = await fetch("/api/platform/payouts/verify-org", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, verified: true }) });
      if (!res.ok) {
        setBusy(null);
        const j = await res.json().catch(() => ({}));
        return toast.error(j.error || "Couldn't verify the organizer.");
      }
    }
    const supabase = createClient();
    const { data: me } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("risk_alerts").update({ resolved_at: new Date().toISOString(), resolved_by: me.user?.id ?? null }).eq("organization_id", orgId).is("resolved_at", null);
    setBusy(null);
    if (err) return toast.error("Couldn't update the alert.");
    toast.success(verify ? "Organizer verified and alerts closed" : "Alerts dismissed");
    load();
    onChanged();
  }

  const open = (rows ?? []).filter((r) => !r.resolved_at);
  const openOrgs = [...new Map(open.map((a) => [a.organization_id, a])).values()];
  const history = (rows ?? []).filter((r) => r.resolved_at);

  return (
    <>
      <Header title="Risk" sub="Unverified organizers near or at their sales limit, and sudden sales spikes worth a look." loading={loading} onRefresh={load} />
      <ErrorNote error={error} />
      <section className="po-card mb-6">
        <h2 className="po-h2 mb-3">Open alerts</h2>
        {rows && openOrgs.length === 0 && (
          <p className="po-clear">
            <CheckCircle2 size={18} aria-hidden="true" /> Nothing needs a look right now.
          </p>
        )}
        <ul className="pp-list">
          {openOrgs.map((a) => (
            <li key={a.organization_id} className="pp-row">
              <div className="pp-main">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                  <ShieldAlert size={15} className="text-rose-300" aria-hidden="true" />
                  <button type="button" className="pp-orglink" onClick={() => onOpenOrg(a.organization_id)}>{a.organizations?.name ?? "Unknown organizer"}</button>
                  {a.organizations?.payout_verified && <span className="op-chip op-chip--green">Verified</span>}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-fg-3">
                  {open.filter((x) => x.organization_id === a.organization_id).map((k) => (
                    <li key={k.id}>
                      {RISK_LABEL[k.kind] ?? k.kind}: {n(k.tickets)} paid tickets · {k.events?.name ?? "event"} · {ago(k.created_at)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted">
                  {a.organizations?.email}
                  {a.organizations?.created_at ? ` · joined ${day(a.organizations.created_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!a.organizations?.payout_verified && (
                  <button type="button" disabled={busy === a.organization_id} onClick={() => resolve(a.organization_id, true)} className="eb-btn eb-btn--primary">
                    <ShieldCheck size={14} aria-hidden="true" /> Verify
                  </button>
                )}
                <button type="button" disabled={busy === a.organization_id} onClick={() => resolve(a.organization_id, false)} className="eb-btn eb-btn--ghost">
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="po-card">
        <h2 className="po-h2 mb-3">Closed in the last 30 days</h2>
        {rows && history.length === 0 && <Empty>None.</Empty>}
        <ul className="pp-list">
          {history.map((k) => (
            <li key={k.id} className="pp-row pp-row--quiet">
              <div className="pp-main">
                <p className="text-sm text-fg">
                  <button type="button" className="pp-orglink" onClick={() => onOpenOrg(k.organization_id)}>{k.organizations?.name ?? "Unknown organizer"}</button>
                  <span className="text-muted"> · {RISK_LABEL[k.kind] ?? k.kind} · {n(k.tickets)} tickets</span>
                </p>
                <p className="text-xs text-subtle">Raised {day(k.created_at)} · closed {day(k.resolved_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ job health */

type Run = { job?: string; started_at: string; finished_at: string; ok: boolean; http_status: number | null; summary: Record<string, unknown> | null; error: string | null };
export type JobHealth = { jobs: Record<string, { last: Run | null; last_ok_at: string | null; runs_7d: number; failures_7d: number }>; recent: Run[] };

/** "failing", "overdue", "ok" or "waiting" (no runs recorded yet) for one job. */
export function jobState(h: JobHealth | null, job: (typeof CRON_JOBS)[number]): "ok" | "failing" | "overdue" | "waiting" {
  const j = h?.jobs[job.job];
  if (!j?.last) return "waiting";
  if (!j.last.ok) return "failing";
  const hours = (Date.now() - new Date(j.last.started_at).getTime()) / 3600_000;
  return hours > job.everyHours + 1 ? "overdue" : "ok";
}

/** Job health for the tab, the sidebar badge and the Overview: loaded once
 *  and every 5 minutes while the portal is open. */
export function useJobHealth(enabled: boolean) {
  const [data, setData] = useState<JobHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await createClient().rpc("platform_job_health");
    setLoading(false);
    if (err) return setError(missing(err.message));
    setError(null);
    setData(res as JobHealth);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), 300_000);
    return () => window.clearInterval(id);
  }, [enabled, load]);
  const problems = data ? CRON_JOBS.filter((j) => ["failing", "overdue"].includes(jobState(data, j))).length : 0;
  return { data, error, loading, reload: load, problems };
}

const summaryText = (s: Record<string, unknown> | null) =>
  s
    ? Object.entries(s)
        .filter(([k, v]) => k !== "success" && (typeof v === "number" || typeof v === "string"))
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" · ")
    : "";

/** The morning briefing's on/off switch (platform_settings, migration 0124). */
function BriefingSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    createClient()
      .from("platform_settings")
      .select("morning_briefing_enabled")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setOn(data ? data.morning_briefing_enabled !== false : null));
  }, []);
  async function toggle() {
    if (on === null) return;
    setSaving(true);
    const { error: err } = await createClient().from("platform_settings").update({ morning_briefing_enabled: !on }).eq("id", true);
    setSaving(false);
    if (err) return toast.error(/morning_briefing_enabled/.test(err.message) ? "This needs migration 0124 to be run on this database." : "Couldn't save.");
    setOn(!on);
    toast.success(!on ? "Morning briefing on: every admin gets it at 7am" : "Morning briefing off");
  }
  return (
    <section className="po-card mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">Morning briefing email</p>
        <p className="text-xs text-muted">At 7am, every platform admin gets yesterday&apos;s numbers, what&apos;s waiting on them, today&apos;s events and any failed job.</p>
      </div>
      <label className="po-switch">
        <input type="checkbox" checked={!!on} disabled={on === null || saving} onChange={toggle} />
        <span aria-hidden="true" />
        {on === null ? "…" : on ? "On" : "Off"}
      </label>
    </section>
  );
}

export function JobsTab({ health }: { health: ReturnType<typeof useJobHealth> }) {
  const { data, error, loading, reload } = health;
  const label = Object.fromEntries(CRON_JOBS.map((j) => [j.job, j.label]));
  return (
    <>
      <Header title="Job health" sub="The jobs that run on their own: reminders, cleanup and data retention. Each run is recorded here." loading={loading} onRefresh={reload} />
      <ErrorNote error={error} />
      <BriefingSwitch />
      <div className="pp-jobs mb-6">
        {CRON_JOBS.map((j) => {
          const state = jobState(data, j);
          const h = data?.jobs[j.job];
          const Icon = state === "ok" ? CheckCircle2 : state === "failing" ? XCircle : state === "overdue" ? AlertTriangle : Clock;
          return (
            <section key={j.job} className={`pp-job pp-job--${state}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">{j.label}</p>
                  <p className="text-xs text-muted">{j.what}</p>
                </div>
                <span className="pp-job-state"><Icon size={14} aria-hidden="true" /> {state === "ok" ? "Healthy" : state === "failing" ? "Failed" : state === "overdue" ? "Overdue" : "No runs yet"}</span>
              </div>
              <p className="mt-3 text-xs text-fg-3">
                {j.schedule} · last run {ago(h?.last?.started_at ?? null)}
                {h ? ` · ${n(h.runs_7d)} ${Number(h.runs_7d) === 1 ? "run" : "runs"} this week${h.failures_7d ? `, ${n(h.failures_7d)} failed` : ""}` : ""}
              </p>
              {h?.last && !h.last.ok && <p className="mt-1 text-xs text-rose-300">{h.last.error ?? `HTTP ${h.last.http_status}`} · last success {ago(h.last_ok_at)}</p>}
              {h?.last?.ok && summaryText(h.last.summary) && <p className="mt-1 truncate text-xs text-subtle">{summaryText(h.last.summary)}</p>}
            </section>
          );
        })}
      </div>
      <section className="po-card">
        <h2 className="po-h2 mb-3">Latest runs</h2>
        {data && data.recent.length === 0 && <Empty>No runs recorded yet. They appear after the next scheduled run on the live site.</Empty>}
        <ul className="pp-list">
          {(data?.recent ?? []).map((r, i) => {
            const secs = Math.max(0, (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000);
            return (
              <li key={i} className="pp-row pp-row--quiet">
                {r.ok ? <CheckCircle2 size={16} className="shrink-0 text-emerald-300" aria-label="Succeeded" /> : <XCircle size={16} className="shrink-0 text-rose-300" aria-label="Failed" />}
                <div className="pp-main">
                  <p className="text-sm text-fg">
                    {label[r.job ?? ""] ?? r.job} <span className="text-muted">· {new Date(r.started_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {secs < 1 ? "<1" : secs.toFixed(secs < 10 ? 1 : 0)}s</span>
                  </p>
                  <p className={`truncate text-xs ${r.ok ? "text-subtle" : "text-rose-300"}`}>{r.ok ? summaryText(r.summary) || "Done" : r.error ?? `HTTP ${r.http_status}`}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
