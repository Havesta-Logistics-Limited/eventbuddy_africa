"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Building2, Calendar, CornerDownLeft, CreditCard, Landmark, Megaphone, Search, Store, User, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/billing";

type Results = {
  q: string;
  organizations: { id: string; name: string; slug: string | null; email: string | null; phone: string | null; verified: boolean; suspended: boolean; organization_id: string }[];
  events: { id: string; name: string; date: string; published: boolean; location: string | null; organization: string; organization_id: string }[];
  attendees: { id: string; full_name: string | null; email: string | null; phone: string | null; reference_id: string | null; status: string; event: string; organization_id: string }[];
  payments: { id: string; reference: string; amount_naira: number; status: string; purpose: string; buyer: string | null; buyer_email: string | null; organization: string | null; organization_id: string | null; test: boolean; created_at: string }[];
  payouts: { id: string; amount_naira: number; status: string; requested_at: string; bank_name: string | null; account_number_last4: string | null; payee: string; organization_id: string | null }[];
  promoters: { id: string; handle: string; full_name: string | null; email: string | null; phone: string | null; suspended: boolean; events: number }[];
  exhibitors: { id: string; company_name: string; contact_name: string | null; email: string | null; status: string; stand_label: string | null; event: string; organization_id: string }[];
};

type Item = { key: string; icon: typeof Search; title: string; sub: string; meta?: string; orgId: string | null; group: string };

const PURPOSE: Record<string, string> = { ticket_purchase: "Ticket", stand_booking: "Stand", event_publish: "Publishing", subscription: "Plan" };
const dateShort = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

function toItems(r: Results): Item[] {
  return [
    ...r.organizations.map((o) => ({
      key: "o" + o.id, icon: Building2, group: "Organizers", orgId: o.organization_id,
      title: o.name + (o.suspended ? " · suspended" : ""), sub: [o.email, o.phone, o.slug && "/" + o.slug].filter(Boolean).join(" · "), meta: o.verified ? "Verified" : undefined,
    })),
    ...r.events.map((e) => ({
      key: "e" + e.id, icon: Calendar, group: "Events", orgId: e.organization_id,
      title: e.name, sub: `${e.organization} · ${dateShort(e.date)}${e.location ? " · " + e.location : ""}`, meta: e.published ? undefined : "Draft",
    })),
    ...r.attendees.map((a) => ({
      key: "a" + a.id, icon: User, group: "Attendees", orgId: a.organization_id,
      title: a.full_name || a.email || "Attendee", sub: [a.event, a.email, a.phone].filter(Boolean).join(" · "), meta: a.reference_id ?? undefined,
    })),
    ...r.payments.map((t) => ({
      key: "t" + t.id, icon: CreditCard, group: "Payments", orgId: t.organization_id,
      title: `${formatNaira(Number(t.amount_naira))} · ${PURPOSE[t.purpose] ?? t.purpose} · ${t.status}${t.test ? " · test" : ""}`,
      // long references would crowd out the amount and status, so show the start of it
      sub: [t.buyer, t.buyer_email, t.organization].filter(Boolean).join(" · "), meta: t.reference.length > 14 ? t.reference.slice(0, 13) + "…" : t.reference,
    })),
    ...r.payouts.map((p) => ({
      key: "p" + p.id, icon: Landmark, group: "Payouts", orgId: p.organization_id,
      title: `${formatNaira(Number(p.amount_naira))} to ${p.payee} · ${p.status}`, sub: `${p.bank_name ?? "Bank"}${p.account_number_last4 ? " ••" + p.account_number_last4 : ""} · ${dateShort(p.requested_at)}`,
    })),
    ...r.promoters.map((p) => ({
      key: "m" + p.id, icon: Megaphone, group: "Promoters", orgId: null,
      title: `@${p.handle}${p.full_name ? " · " + p.full_name : ""}${p.suspended ? " · suspended" : ""}`, sub: [p.email, p.phone, `${p.events} ${p.events === 1 ? "event" : "events"}`].filter(Boolean).join(" · "),
    })),
    ...r.exhibitors.map((x) => ({
      key: "x" + x.id, icon: Store, group: "Exhibitors", orgId: x.organization_id,
      title: x.company_name, sub: [x.event, x.contact_name, x.email].filter(Boolean).join(" · "), meta: x.stand_label ? `Stand ${x.stand_label}` : x.status,
    })),
  ];
}

/**
 * Search everything (⌘K / Ctrl+K): organizers, events, attendees, payments,
 * payouts, promoters and exhibitors, through migration 0122's platform_search.
 * Picking a result opens that organizer's profile.
 */
export function PlatformSearch({ open, onClose, onOpenOrg }: { open: boolean; onClose: () => void; onOpenOrg: (orgId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear results as the query is emptied
      setResults(null);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      setLoading(true);
      const { data, error: err } = await createClient().rpc("platform_search", { p_q: term });
      if (mine !== seq.current) return; // a newer search is on its way
      setLoading(false);
      if (err) {
        setError(/platform_search|does not exist/i.test(err.message) ? "Search needs migration 0122 to be run on this database." : err.message);
        return;
      }
      setError(null);
      setResults(data as Results);
      setActive(0);
    }, 220);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const items = useMemo(() => (results ? toItems(results) : []), [results]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function pick(it: Item | undefined) {
    if (!it?.orgId) return;
    onOpenOrg(it.orgId);
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(items[active]);
    }
  }

  return (
    <div className="ps-wrap" role="dialog" aria-modal="true" aria-label="Search everything" onKeyDown={onKey}>
      <button type="button" className="ps-backdrop" aria-label="Close search" onClick={onClose} />
      <div className="ps-panel">
        <div className="ps-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search organizers, events, attendees, payments, phone numbers…"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="ps-results"
            aria-activedescendant={items[active] ? `ps-${items[active].key}` : undefined}
          />
          {loading && <span className="ps-spin" aria-hidden="true" />}
          <button type="button" className="ps-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} id="ps-results" className="ps-results" role="listbox">
          {error && <p className="ps-note ps-note--err">{error}</p>}
          {!error && q.trim().length < 2 && (
            <div className="ps-hint">
              <p>Find anything on eventbuddy. Try an organizer&apos;s name, an attendee&apos;s email, a phone number in any format, a ticket reference or a payment reference.</p>
            </div>
          )}
          {!error && results && items.length === 0 && !loading && <p className="ps-note">Nothing matches &ldquo;{results.q}&rdquo;.</p>}
          {items.map((it, i) => {
            const heading = it.group !== items[i - 1]?.group;
            return (
              <div key={it.key}>
                {heading && <p className="ps-group">{it.group}</p>}
                <button
                  type="button"
                  id={`ps-${it.key}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={!it.orgId || undefined}
                  className="ps-item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(it)}
                >
                  <span className="ps-item-icon"><it.icon size={16} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-fg">{it.title}</span>
                    {it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}
                  </span>
                  {it.meta && (
                    <span className="ps-meta">
                      {it.meta === "Verified" && <BadgeCheck size={12} aria-hidden="true" />}
                      {it.meta}
                    </span>
                  )}
                  {i === active && it.orgId && <CornerDownLeft size={14} className="ps-enter" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="ps-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open organizer</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
