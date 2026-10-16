"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/billing";
import { sourceLabel } from "@/lib/marketing-attribution";
import { EventMarketingTab } from "@/components/event-marketing-tab";

/**
 * Platform → Marketing (migration 0133): the event Marketing report across
 * every event: totals, sources, link types and the events drawing the most
 * visits and sales, with a drill-down into any one event's own report.
 */

type Sums = { visits: number; visitors: number; registrations: number; orders: number; tickets: number; revenue: number };
type EventRow = Sums & { event_id: string; name: string; slug: string | null; date: string; visibility: string; org_name: string; org_id: string; top_source: string | null };
type Report = {
  totals: Sums & { tracked: number; events: number };
  by_source: (Sums & { source: string })[];
  by_kind: (Sums & { kind: string })[];
  events: EventRow[];
  tracking_since: string | null;
};

const RANGES = [
  { id: "all", label: "All time", days: null },
  { id: "30", label: "30 days", days: 30 },
  { id: "7", label: "7 days", days: 7 },
] as const;

const KIND_LABELS: Record<string, string> = { public: "Public event links", private: "Private links", promoter: "Promoter links", tagged: "Tagged links", unknown: "Not recorded" };
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export function PlatformMarketing({ includeTest, onOpenOrg }: { includeTest: boolean; onOpenOrg: (orgId: string) => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<EventRow | null>(null);
  const [partners, setPartners] = useState<{ eventId: string; code: string; partnerName: string }[]>([]);

  useEffect(() => {
    let live = true;
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    createClient()
      .rpc("platform_marketing_report", { p_since: days ? new Date(Date.now() - days * 86400_000).toISOString() : null, p_include_test: includeTest })
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) setError(e.message);
        else {
          setError("");
          setReport(data as Report);
        }
      });
    return () => {
      live = false;
    };
  }, [range, includeTest]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    createClient()
      .from("event_referrals")
      .select("event_id, code, partner_name")
      .eq("event_id", open.event_id)
      .then(({ data }) => {
        if (live) setPartners((data ?? []).map((r) => ({ eventId: r.event_id, code: r.code, partnerName: r.partner_name })));
      });
    return () => {
      live = false;
    };
  }, [open]);

  if (open) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft size={15} aria-hidden="true" /> All events
        </button>
        <div>
          <h2 className="text-lg font-semibold text-fg">{open.name}</h2>
          <button type="button" onClick={() => onOpenOrg(open.org_id)} className="text-sm text-[#c4b5fd] hover:underline">
            {open.org_name}
          </button>
        </div>
        <EventMarketingTab event={{ id: open.event_id, slug: open.slug ?? undefined }} referrals={partners} />
      </div>
    );
  }

  const t = report?.totals;
  const maxVisits = Math.max(1, ...(report?.by_source ?? []).map((s) => s.visits));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <BarChart3 size={18} className="text-[#a78bfa]" aria-hidden="true" /> Marketing
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Every event&apos;s visits and sales by source and link.
            {report?.tracking_since ? ` Tracked since ${new Date(report.tracking_since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.` : " Tracking starts with the first visit."}
            {includeTest ? " Includes test payments." : ""}
          </p>
        </div>
        <div className="eb-seg" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="eb-alert" role="alert">{error}</p>
      ) : !report || !t ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { k: "Visits", v: t.visits.toLocaleString() },
              { k: "Unique visitors", v: t.visitors.toLocaleString() },
              { k: "Tickets sold", v: t.orders.toLocaleString(), sub: t.tickets !== t.orders ? `${t.tickets} people` : undefined },
              { k: "Ticket revenue", v: formatNaira(t.revenue) },
              { k: "Conversion", v: pct(t.tracked, t.visitors), sub: "tracked sales ÷ visitors" },
              { k: "Events visited", v: t.events.toLocaleString() },
            ].map((c) => (
              <div key={c.k} className="eb-card p-4">
                <p className="text-xs text-muted">{c.k}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{c.v}</p>
                {c.sub && <p className="text-[11px] text-subtle">{c.sub}</p>}
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-fg">Where visitors came from</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-muted">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Source</th>
                      <th className="px-4 py-2.5 text-right font-medium">Visitors</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                      <th className="px-4 py-2.5 text-right font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {report.by_source.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No visits yet.</td></tr>
                    ) : (
                      report.by_source.map((r) => (
                        <tr key={r.source}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-fg">{r.source === "unknown" ? "Not recorded" : sourceLabel(r.source)}</div>
                            <div className="mt-1.5 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-fill" aria-hidden="true">
                              <div className="h-full rounded-full bg-[#a78bfa]" style={{ width: `${Math.round((r.visits / maxVisits) * 100)}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.visitors}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg">{r.orders}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-fg">{formatNaira(Number(r.revenue))}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-3">{r.source === "unknown" ? "—" : pct(r.orders + r.registrations, r.visitors)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-fg">By kind of link</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-muted">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Link</th>
                      <th className="px-4 py-2.5 text-right font-medium">Visitors</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                      <th className="px-4 py-2.5 text-right font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {report.by_kind.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No visits yet.</td></tr>
                    ) : (
                      report.by_kind.map((r) => (
                        <tr key={r.kind}>
                          <td className="px-4 py-3 font-medium text-fg">{KIND_LABELS[r.kind] ?? r.kind}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.visitors}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg">{r.orders}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-fg">{formatNaira(Number(r.revenue))}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-3">{r.kind === "unknown" ? "—" : pct(r.orders + r.registrations, r.visitors)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Events</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Event</th>
                    <th className="px-4 py-2.5 text-left font-medium">Top source</th>
                    <th className="px-4 py-2.5 text-right font-medium">Visitors</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {report.events.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No event visits yet.</td></tr>
                  ) : (
                    report.events.map((e) => (
                      <tr key={e.event_id} className="cursor-pointer hover:bg-canvas" onClick={() => setOpen(e)}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-fg">{e.name}{e.visibility === "private" ? " · private" : ""}</div>
                          <div className="text-xs text-muted">{e.org_name}</div>
                        </td>
                        <td className="px-4 py-3 text-fg-2">{e.top_source ? sourceLabel(e.top_source) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg-2">{e.visitors}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg">{e.orders}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-fg">{formatNaira(Number(e.revenue))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-subtle">Click an event for its full report by link and source.</p>
          </section>
        </>
      )}
    </div>
  );
}
