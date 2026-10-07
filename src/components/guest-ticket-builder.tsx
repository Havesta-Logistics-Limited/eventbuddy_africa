"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import type { GuestTicket } from "@/lib/guest-draft";

export type TicketPlan = { paid: boolean; tickets: GuestTicket[] };

export const EMPTY_TICKET: GuestTicket = { name: "Regular", priceNaira: 0, quantityAvailable: null, groupSize: 1 };

/** Paid events need at least one ticket, each with a name and a real price. */
export function ticketPlanValid(plan: TicketPlan) {
  return !plan.paid || (plan.tickets.length > 0 && plan.tickets.every((t) => t.name.trim() && t.priceNaira >= 100));
}

/** /create's ticket step: free registration, or paid ticket types. */
export function GuestTicketBuilder({ plan, onChange }: { plan: TicketPlan; onChange: (plan: TicketPlan) => void }) {
  const [fee, setFee] = useState(DEFAULT_TICKET_FEE);
  useEffect(() => {
    fetchCurrentTicketFee().then(setFee).catch(() => {});
  }, []);

  const set = (i: number, p: Partial<GuestTicket>) => onChange({ ...plan, tickets: plan.tickets.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  return (
    <div className="space-y-4">
      <div className="eb-seg w-full" role="group" aria-label="Free or paid">
        <button type="button" aria-pressed={!plan.paid} onClick={() => onChange({ ...plan, paid: false })} className="flex-1">
          Free event
        </button>
        <button
          type="button"
          aria-pressed={plan.paid}
          onClick={() => onChange({ paid: true, tickets: plan.tickets.length ? plan.tickets : [{ ...EMPTY_TICKET }] })}
          className="flex-1"
        >
          Sell tickets
        </button>
      </div>

      {!plan.paid ? (
        <p className="text-sm text-muted">Attendees register for free and get a QR ticket by email. You can add paid tickets later.</p>
      ) : (
        <>
          {plan.tickets.map((t, i) => (
            <div key={i} className="rounded-xl p-3 ring-1 ring-line">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor={`gt-name-${i}`} className="eb-label eb-req">Ticket name</label>
                  <input id={`gt-name-${i}`} className="eb-input" maxLength={80} placeholder="Regular, VIP, Early bird…" value={t.name} onChange={(e) => set(i, { name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`gt-price-${i}`} className="eb-label eb-req">Price (₦)</label>
                  <input
                    id={`gt-price-${i}`}
                    className="eb-input"
                    inputMode="numeric"
                    placeholder="10000"
                    value={t.priceNaira ? String(t.priceNaira) : ""}
                    onChange={(e) => set(i, { priceNaira: Math.min(10_000_000, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                  />
                </div>
                <div>
                  <label htmlFor={`gt-qty-${i}`} className="eb-label">How many</label>
                  <input
                    id={`gt-qty-${i}`}
                    className="eb-input"
                    inputMode="numeric"
                    placeholder="No limit"
                    value={t.quantityAvailable ? String(t.quantityAvailable) : ""}
                    onChange={(e) => set(i, { quantityAvailable: Number(e.target.value.replace(/\D/g, "")) || null })}
                  />
                </div>
                <div>
                  <label htmlFor={`gt-group-${i}`} className="eb-label">Admits</label>
                  <select id={`gt-group-${i}`} className="eb-input" value={t.groupSize} onChange={(e) => set(i, { groupSize: Number(e.target.value) })}>
                    <option value={1}>1 person</option>
                    {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        Group of {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end justify-end">
                  {plan.tickets.length > 1 && (
                    <button type="button" onClick={() => onChange({ ...plan, tickets: plan.tickets.filter((_, j) => j !== i) })} className="eb-btn eb-btn--ghost" aria-label={`Remove ${t.name || "ticket"}`}>
                      <Trash2 size={14} /> Remove
                    </button>
                  )}
                </div>
              </div>
              {t.priceNaira > 0 && t.priceNaira < 100 && <p className="mt-2 text-xs text-rose-300">The lowest ticket price is ₦100.</p>}
            </div>
          ))}
          {plan.tickets.length < 20 && (
            <button type="button" onClick={() => onChange({ ...plan, tickets: [...plan.tickets, { ...EMPTY_TICKET, name: "" }] })} className="eb-btn eb-btn--ghost w-full">
              <Plus size={14} /> Add a ticket type
            </button>
          )}
          <p className="text-xs text-subtle">
            eventbuddy&apos;s fee is {formatTicketFee(fee)} per ticket sold. Sales dates, discount codes and more are on your event page after you save.
          </p>
        </>
      )}
    </div>
  );
}
