"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Check, Copy, Link2, Loader2, Megaphone } from "lucide-react";
import type { EventRecord, ReferralPartner } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { copyText } from "@/lib/copy-text";
import { formatNaira } from "@/lib/billing";
import { normalizeSource, sourceLabel } from "@/lib/marketing-attribution";

/**
 * Event page → Marketing: how every link and every source is doing (migration
 * 0132): visits, unique visitors, sign-ups, tickets sold, revenue and
 * conversion, plus a builder for tagged links, the reliable way to measure
 * WhatsApp and other apps that don't say where a visitor came from.
 */

type Row = { kind: string; code: string; source?: string; visits: number; visitors: number; registrations: number; orders: number; tickets: number; revenue: number };
type Report = {
  totals: { visits: number; visitors: number; registrations: number; orders: number; tickets: number; revenue: number };
  by_link: Row[];
  by_source: (Omit<Row, "kind" | "code"> & { source: string })[];
  tracking_since: string | null;
};

const RANGES = [
  { id: "all", label: "All time", days: null },
  { id: "30", label: "30 days", days: 30 },
  { id: "7", label: "7 days", days: 7 },
] as const;

const TAG_CHOICES = ["instagram", "facebook", "whatsapp", "x", "tiktok", "linkedin", "email", "qr"];

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export function EventMarketingTab({
  event,
  referrals,
  shareUrl,
}: {
  event: Pick<EventRecord, "id" | "slug">;
  referrals: Pick<ReferralPartner, "eventId" | "code" | "partnerName">[];
  /** the event's link for the optional link builder; omitted = no builder (platform view) */
  shareUrl?: string;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [tag, setTag] = useState("instagram");
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let live = true;
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : null;
    createClient()
      .rpc("event_marketing_report", { p_event: event.id, p_since: since })
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
  }, [event.id, range]);

  const partnerByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of referrals) if (r.eventId === event.id) m.set(r.code.toLowerCase(), r.partnerName);
    return m;
  }, [referrals, event.id]);

  function linkLabel(r: Row): { title: string; sub: string } {
    if (r.kind === "public") return { title: "Public event link", sub: "eventbuddy.africa/" + (event.slug ?? "…") };
    if (r.kind === "private") return { title: "Private link", sub: r.code ? `/p/${r.code.toUpperCase()}` : "private link" };
    if (r.kind === "promoter") return { title: partnerByCode.get(r.code) ?? `Promoter ${r.code.toUpperCase()}`, sub: `promoter link · ?ref=${r.code.toUpperCase()}` };
    if (r.kind === "tagged") return { title: `Tagged: ${sourceLabel(r.code)}`, sub: `?src=${r.code}` }; // older visits only
    return { title: "Not recorded", sub: "sales before tracking started" };
  }

  const tagCode = custom.trim() ? normalizeSource(custom) ?? "" : tag;
  const sep = shareUrl?.includes("?") ? "&" : "?";
  const taggedUrl = tagCode && shareUrl ? `${shareUrl}${sep}src=${encodeURIComponent(tagCode)}` : "";

  async function copy(text: string, id: string) {
    await copyText(text);
    setCopied(id);
    toast.success("Link copied");
    setTimeout(() => setCopied(""), 1500);
  }

  const t = report?.totals;
  const maxSourceVisits = Math.max(1, ...(report?.by_source ?? []).map((s) => s.visits));
  const isPaid = (t?.orders ?? 0) > 0;
  // conversion only counts sales credited to a tracked visit (not ones from before tracking)
  const tracked = (report?.by_link ?? []).filter((r) => r.kind !== "unknown").reduce((n, r) => n + Number(r.orders) + Number(r.registrations), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <BarChart3 size={17} className="text-[#e879f9]" aria-hidden="true" /> Marketing report
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {report?.tracking_since
              ? `Visits tracked since ${new Date(report.tracking_since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Sales are credited to the link and source that last brought the buyer (within 30 days).`
              : "Visits are tracked from now on. Sales are credited to the link and source that last brought the buyer (within 30 days)."}
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
      ) : !report ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading the report…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { k: "Visits", v: t!.visits.toLocaleString() },
              { k: "Unique visitors", v: t!.visitors.toLocaleString() },
              { k: isPaid ? "Tickets sold" : "Sign-ups", v: (isPaid ? t!.orders : t!.registrations).toLocaleString(), sub: isPaid && t!.tickets !== t!.orders ? `${t!.tickets} people` : undefined },
              { k: "Revenue", v: formatNaira(t!.revenue) },
              { k: "Conversion", v: pct(tracked, t!.visitors), sub: "of unique visitors" },
            ].map((c) => (
              <div key={c.k} className="eb-card p-4">
                <p className="text-xs text-muted">{c.k}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{c.v}</p>
                {c.sub && <p className="text-[11px] text-subtle">{c.sub}</p>}
              </div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">By link</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Link</th>
                    <th className="px-4 py-2.5 text-right font-medium">Visits</th>
                    <th className="px-4 py-2.5 text-right font-medium">Visitors</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sign-ups</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {report.by_link.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted">No visits yet. Share the event link and check back.</td>
                    </tr>
                  ) : (
                    report.by_link.map((r) => {
                      const l = linkLabel(r);
                      return (
                        <tr key={`${r.kind}:${r.code}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-fg">{l.title}</div>
                            <div className="font-mono text-xs text-muted">{l.sub}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.visits}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.visitors}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.registrations}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg">{r.orders}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-fg">{formatNaira(Number(r.revenue))}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg-3">{pct(r.orders + r.registrations, r.visitors)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">By source</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Where they came from</th>
                    <th className="px-4 py-2.5 text-right font-medium">Visits</th>
                    <th className="px-4 py-2.5 text-right font-medium">Visitors</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sign-ups</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {report.by_source.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted">No visits yet.</td>
                    </tr>
                  ) : (
                    report.by_source.map((r) => (
                      <tr key={r.source}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-fg">{r.source === "unknown" ? "Not recorded" : sourceLabel(r.source)}</div>
                          <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-fill" aria-hidden="true">
                            <div className="h-full rounded-full bg-[#e879f9]" style={{ width: `${Math.round((r.visits / maxSourceVisits) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.visits}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.visitors}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg-2">{r.registrations}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg">{r.orders}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-fg">{formatNaira(Number(r.revenue))}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg-3">{pct(r.orders + r.registrations, r.visitors)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-subtle">
              Detected automatically. WhatsApp doesn&apos;t say where a visitor came from, so a link pasted into WhatsApp by hand shows as Direct; links shared with the event page&apos;s WhatsApp button are credited to WhatsApp.
            </p>
          </section>
        </>
      )}

      {shareUrl && (
      <details className="eb-card p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-fg">
          <Megaphone size={15} className="text-[#e879f9]" aria-hidden="true" /> Optional: a link for a specific place
        </summary>
        <p className="mt-1 text-xs text-muted">Not needed for most sources. Useful for WhatsApp broadcasts, flyers (QR code) or a campaign you want to measure on its own.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TAG_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={!custom.trim() && tag === c}
              onClick={() => {
                setTag(c);
                setCustom("");
              }}
              className="eb-chip"
            >
              {sourceLabel(c)}
            </button>
          ))}
        </div>
        <label htmlFor="mk-custom" className="eb-label mt-3">Or name your own (e.g. radio ad, Pulse blog)</label>
        <input id="mk-custom" value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} placeholder="Custom name" className="eb-input max-w-sm" />
        {taggedUrl && (
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
            <Link2 size={14} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">{taggedUrl}</span>
            <button type="button" onClick={() => copy(taggedUrl, "tag")} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg-2 hover:bg-fill">
              {copied === "tag" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} {copied === "tag" ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </details>
      )}
    </div>
  );
}
