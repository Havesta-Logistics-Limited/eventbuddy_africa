"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNaira } from "@/lib/billing";
import { getEventSales, useTicketTypes, type EventSale } from "@/lib/store";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

// Same tone order as the ticket cards (globals.css .eb-tt): pink, violet, orange, indigo.
const TONES = ["#d946ef", "#8b5cf6", "#fb923c", "#818cf8"];
const NO_TICKET = "#64748b";
const DAYS = 14;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * The top of an event's Dashboard tab: three plain number cards, sign-ups per
 * day for the last two weeks stacked by ticket type, and the latest payments
 * (paid events) or latest sign-ups (free events). Modelled on the landing
 * page's dashboard mock.
 */
export function EventOverview({ event, registrations }: { event: EventRecord; registrations: RegistrationRecord[] }) {
  const allTickets = useTicketTypes();
  const tickets = useMemo(() => allTickets.filter((t) => t.eventId === event.id), [allTickets, event.id]);
  const paid = tickets.some((t) => t.priceNaira > 0);
  const [sales, setSales] = useState<EventSale[] | null>(null);

  useEffect(() => {
    if (!paid) return;
    let live = true;
    getEventSales(event.id)
      .then((s) => live && setSales(s))
      .catch(() => live && setSales([]));
    return () => {
      live = false;
    };
  }, [event.id, paid]);

  const active = registrations.filter((r) => r.status === "registered" || r.status === "checked_in");
  const checkedIn = registrations.filter((r) => r.status === "checked_in").length;
  const capacity = tickets.every((t) => t.quantityAvailable != null) && tickets.length > 0 ? tickets.reduce((s, t) => s + (t.quantityAvailable ?? 0), 0) : null;
  const walkups = registrations.filter((r) => r.source === "kiosk").length;

  const toneOf = (ticketTypeId?: string | null) => {
    const i = tickets.findIndex((t) => t.id === ticketTypeId);
    return i >= 0 ? TONES[i % TONES.length] : NO_TICKET;
  };
  const ticketName = (ticketTypeId?: string | null) => tickets.find((t) => t.id === ticketTypeId)?.name ?? "General";

  // last 14 days, each split by ticket type
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const list = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (DAYS - 1 - i));
      return { date: d, key: dayKey(d), parts: new Map<string, number>() };
    });
    const byKey = new Map(list.map((d) => [d.key, d]));
    for (const r of active) {
      const day = byKey.get(dayKey(new Date(r.createdAt)));
      if (!day) continue;
      const k = r.ticketTypeId ?? "none";
      day.parts.set(k, (day.parts.get(k) ?? 0) + 1);
    }
    return list;
  }, [active]);
  const maxDay = Math.max(1, ...days.map((d) => [...d.parts.values()].reduce((a, b) => a + b, 0)));
  const usedTickets = [...new Set(days.flatMap((d) => [...d.parts.keys()]))];
  const recentTotal = days.reduce((s, d) => s + [...d.parts.values()].reduce((a, b) => a + b, 0), 0);

  const gross = (sales ?? []).reduce((s, x) => s + x.amountNaira, 0);
  const net = (sales ?? []).reduce((s, x) => s + x.netNaira, 0);

  const cards = paid
    ? [
        { label: "Sold", value: String(sales?.length ?? "…"), sub: capacity != null ? `of ${capacity} tickets` : "tickets" },
        { label: "Ticket sales", value: sales ? formatNaira(gross) : "…", sub: "paid by buyers" },
        { label: "To your balance", value: sales ? formatNaira(net) : "…", sub: "after eventbuddy's fee" },
      ]
    : [
        { label: "Registered", value: String(active.length), sub: capacity != null ? `of ${capacity} places` : "attendees" },
        { label: "Checked in", value: String(checkedIn), sub: active.length ? `${Math.round((checkedIn / active.length) * 100)}% of registered` : "nobody yet" },
        { label: "Walk-ups", value: String(walkups), sub: "registered at the door" },
      ];

  const latest = paid
    ? (sales ?? []).slice(0, 6).map((s) => ({ key: s.at + s.name, name: s.name, sub: `${ticketName(s.ticketTypeId)} · fee ${formatNaira(s.feeNaira)}`, right: `+${formatNaira(s.netNaira)}`, tone: toneOf(s.ticketTypeId) }))
    : [...active]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
        .map((r) => ({
          key: r.id,
          name: r.fullName,
          sub: `${ticketName(r.ticketTypeId)} · ${r.source === "kiosk" ? "walk-up" : new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
          right: r.status === "checked_in" ? "Checked in" : "Registered",
          tone: toneOf(r.ticketTypeId),
        }));

  return (
    <section className="mb-6" aria-label="Event overview">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="eb-ov-card">
            <p className="eb-ov-label">{c.label}</p>
            <p className="eb-ov-value">{c.value}</p>
            <p className="eb-ov-sub">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="eb-ov-card">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="eb-ov-title">{paid ? "Sales" : "Sign-ups"}, last {DAYS} days</p>
            {usedTickets.length > 0 && (
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                {usedTickets.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2 w-2 rounded-full" style={{ background: toneOf(k === "none" ? null : k) }} />
                    {k === "none" ? "General" : ticketName(k)}
                  </span>
                ))}
              </p>
            )}
          </div>
          {recentTotal === 0 ? (
            <p className="grid h-48 place-items-center text-sm text-subtle">No {paid ? "sales" : "sign-ups"} in the last {DAYS} days yet.</p>
          ) : (
            <div className="eb-ov-bars" role="img" aria-label={`${recentTotal} ${paid ? "tickets sold" : "sign-ups"} in the last ${DAYS} days`}>
              {days.map((d, i) => {
                const total = [...d.parts.values()].reduce((a, b) => a + b, 0);
                return (
                  <div key={d.key} className="eb-ov-col" title={`${d.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${total}`}>
                    <div className="eb-ov-stack" style={{ height: `${(total / maxDay) * 100}%`, animationDelay: `${i * 30}ms` }}>
                      {[...d.parts.entries()].map(([k, n]) => (
                        <span key={k} style={{ flexGrow: n, background: toneOf(k === "none" ? null : k) }} />
                      ))}
                    </div>
                    <span className="eb-ov-day">{d.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="eb-ov-card">
          <p className="eb-ov-title mb-3">{paid ? "Latest payments" : "Latest sign-ups"}</p>
          {latest.length === 0 ? (
            <p className="grid h-40 place-items-center text-sm text-subtle">{paid ? "No payments yet." : "No sign-ups yet."}</p>
          ) : (
            <ul className="space-y-2">
              {latest.map((l) => (
                <li key={l.key} className="eb-ov-row">
                  <i className="h-8 w-1 shrink-0 rounded-full" style={{ background: l.tone }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{l.name}</p>
                    <p className="truncate text-xs text-muted">{l.sub}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${paid || l.right === "Checked in" ? "text-emerald-300" : "text-fg-3"}`}>{l.right}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
