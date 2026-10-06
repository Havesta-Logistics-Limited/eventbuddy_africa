"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  Copy,
  MessageCircle,
  MousePointerClick,
  PauseCircle,
  Store,
  Ticket,
  Wallet,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { AuthLoading } from "@/components/auth-loading";
import { useRequireRole } from "@/lib/auth";
import { formatNaira } from "@/lib/billing";
import { promoterLink } from "@/lib/promoters";
import {
  PersistError,
  getPromoterBalance,
  getPromoterDashboard,
  type PromoterEventRow,
} from "@/lib/store";
import { formatDate } from "@/lib/utils";
import type { AccountBalance, Role } from "@/lib/types";

const PROMOTER_ONLY: Role[] = ["promoter"];

function siteUrl() {
  return typeof window !== "undefined"
    ? window.location.origin
    : "https://eventbuddy.africa";
}

/** A promoter's home: totals, then every event they're promoting with their
 *  link, a ready-to-send caption and how it's doing. */
export default function PromoterDashboardPage() {
  const session = useRequireRole(PROMOTER_ONLY);
  const [rows, setRows] = useState<PromoterEventRow[] | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([
        getPromoterDashboard(),
        getPromoterBalance(),
      ]);
      setRows(r);
      setBalance(b);
    } catch (err) {
      toast.error(
        err instanceof PersistError
          ? err.message
          : "Couldn't load your events.",
      );
      setRows([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    if (session) load();
  }, [session, load]);

  if (!session) return <AuthLoading />;
  const handle = session.promoterHandle ?? "";
  const totals = (rows ?? []).reduce(
    (t, r) => ({
      clicks: t.clicks + r.clicks,
      sales: t.sales + r.paidSales,
      earned: t.earned + r.earnedNaira,
    }),
    { clicks: 0, sales: 0, earned: 0 },
  );

  return (
    <Shell>
      <div className="eb-app-page p-6 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="eb-app-title">My events</h1>
            <p className="eb-app-sub">
              You&apos;re promoting as @{handle}. Share your links; every ticket
              sold through them earns you commission.
            </p>
          </div>
          <Link href="/marketplace" className="eb-btn eb-btn--primary">
            <Store size={16} aria-hidden="true" /> Find events to promote
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: "Earned",
              value: formatNaira(totals.earned),
              icon: Wallet,
            },
            {
              label: "Available to withdraw",
              value: formatNaira(Math.max(0, balance?.availableNaira ?? 0)),
              icon: Wallet,
            },
            {
              label: "Tickets sold",
              value: String(totals.sales),
              icon: Ticket,
            },
            {
              label: "Link clicks",
              value: String(totals.clicks),
              icon: MousePointerClick,
            },
          ].map((s) => (
            <div key={s.label} className="eb-stat">
              <p className="eb-stat-label">{s.label}</p>
              <p className="eb-stat-value">{s.value}</p>
            </div>
          ))}
        </div>

        {rows === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="eb-card items-center p-10 text-center">
            <Store size={28} className="mb-3 text-faint" aria-hidden="true" />
            <p className="font-medium text-fg-2">
              You&apos;re not promoting any events yet
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-muted">
              Browse the marketplace, pick an event you&apos;d happily share,
              and you&apos;ll get your own link straight away.
            </p>
            <Link href="/marketplace" className="eb-btn eb-btn--primary mt-5">
              Open the marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <PromotedEvent key={r.referralId} row={r} handle={handle} />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

function PromotedEvent({
  row,
  handle,
}: {
  row: PromoterEventRow;
  handle: string;
}) {
  const [copied, setCopied] = useState<"link" | "caption" | null>(null);
  const link = promoterLink(
    siteUrl(),
    { slug: row.eventSlug, orgSlug: row.orgSlug, eventId: row.eventId },
    handle,
  );
  const caption = `${row.shareCaption?.trim() || `Join me at ${row.eventName} on ${formatDate(row.eventDate)}. Get your ticket here:`} ${link}`;
  const live = row.active && row.programEnabled;

  function copy(text: string, what: "link" | "caption") {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    // .eb-card is a flex column outside Tailwind's layers, so the row lives on an inner wrapper
    <article className="eb-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* .eb-cover-ph is width:100% outside Tailwind's layers, so this box sets the size */}
        <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl sm:h-auto sm:min-h-32 sm:w-40">
          <div className="eb-cover-ph">
            {row.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="!text-[15px]">{row.eventName}</span>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-fg">
                {row.eventName}
              </h2>
              <p className="text-xs text-muted">
                {formatDate(row.eventDate)} · {row.orgName} ·{" "}
                {row.commissionPct}% of net
                {row.commissionCapNaira != null &&
                  ` (max ${formatNaira(row.commissionCapNaira)} per ticket)`}
              </p>
            </div>
            {!live && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                <PauseCircle size={11} aria-hidden="true" />{" "}
                {row.active
                  ? "Program paused by organizer"
                  : "Paused by organizer"}
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Clicks", String(row.clicks)],
              ["Tickets sold", String(row.paidSales)],
              ["Earned", formatNaira(row.earnedNaira)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-fill px-2 py-2">
                <p className="text-sm font-semibold tabular-nums text-fg">
                  {v}
                </p>
                <p className="text-[11px] text-muted">{l}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-fill px-3 py-2 text-xs text-fg-2">
              {link}
            </code>
            <button
              type="button"
              className="eb-btn eb-btn--ghost"
              onClick={() => copy(link, "link")}
            >
              {copied === "link" ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}{" "}
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="eb-btn eb-btn--ghost"
              onClick={() => copy(caption, "caption")}
            >
              {copied === "caption" ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}{" "}
              {copied === "caption" ? "Copied" : "Copy caption"}
            </button>
            <a
              className="eb-btn eb-btn--primary"
              href={`https://wa.me/?text=${encodeURIComponent(caption)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={14} aria-hidden="true" /> WhatsApp
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
