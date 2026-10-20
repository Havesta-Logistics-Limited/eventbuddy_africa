"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, QrCode, UserPlus } from "lucide-react";
import { TicketTag } from "@/components/fast-scan-stage";
import { brandedQrDataUrl } from "@/lib/branded-qr";
import { isValidEmail, sanitizePhoneInput } from "@/lib/validation";
import { fetchProcessingFee, formatNaira, processingFeeNaira, type ProcessingFee } from "@/lib/billing";

type PaystackPopup = { resumeTransaction: (accessCode: string, cb: { onSuccess?: (t: unknown) => void; onCancel?: () => void; onError?: (e: { message?: string }) => void }) => void };

/** Paystack's payment window script, loaded once on first use. */
function loadPaystack(): Promise<new () => PaystackPopup> {
  const w = window as unknown as { PaystackPop?: new () => PaystackPopup };
  if (w.PaystackPop) return Promise.resolve(w.PaystackPop);
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://js.paystack.co/v2/inline.js";
    el.async = true;
    el.onload = () => (w.PaystackPop ? resolve(w.PaystackPop) : reject(new Error("Paystack didn't load.")));
    el.onerror = () => reject(new Error("Couldn't load Paystack. Check the connection."));
    document.head.appendChild(el);
  });
}

type KioskInfo = {
  virtual: boolean;
  freeRegistration: boolean;
  freeTickets: { id: string; name: string; left: number | null }[];
  /** single paid tickets the kiosk can sell (payment through Paystack first) */
  paidTickets: { id: string; name: string; priceNaira: number; left: number | null }[];
  sellsPaid: boolean;
  /** paid group tickets: sold through the buy QR (every guest's details are needed) */
  sellsGroups: boolean;
  buyUrl: string;
  orgSlug: string;
  eventId: string;
};

export type WalkupResult = {
  outcome: "registered" | "existing" | "already";
  fullName: string;
  referenceId?: string;
  checkedInAt?: string;
  emailSent?: boolean;
  /** the ticket category, shown as a tag */
  ticket?: string;
  /** sold and paid for at the door */
  paid?: boolean;
};

/**
 * Kiosk → Register walk-up. Free events: a short form that registers the
 * attendee and checks them in at once (no second scan). Paid events: a large
 * QR the walk-up scans with their own phone to buy a ticket, after which
 * staff scan their ticket in the Scan tab. Mixed events get both.
 */
export function KioskRegister({
  staffId,
  onResult,
  onError,
}: {
  staffId: string;
  onResult: (r: WalkupResult) => void;
  onError: (message: string) => void;
}) {
  const [info, setInfo] = useState<KioskInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [buyQr, setBuyQr] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", ticketTypeId: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"" | "register" | "pay" | "confirm">("");
  const [processingFee, setProcessingFee] = useState<ProcessingFee | null>(null);
  /** a paid door sale that just went through: its ticket QR, like the online confirmation */
  const [paidDone, setPaidDone] = useState<{ fullName: string; referenceId: string | null; ticket: string; qr: string } | null>(null);

  useEffect(() => {
    fetch(`/api/kiosk/register?staffId=${encodeURIComponent(staffId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) return setLoadError(json.error);
        setInfo(json);
        const first = json.freeTickets?.[0] ?? json.paidTickets?.[0];
        if (first) setForm((f) => ({ ...f, ticketTypeId: first.id }));
        if (json.sellsPaid && json.buyUrl) brandedQrDataUrl(json.buyUrl, { width: 640, margin: 1 }).then(setBuyQr).catch(() => {});
      })
      .catch(() => setLoadError("Couldn't load this event's tickets. Check your connection."));
    fetchProcessingFee()
      .then(setProcessingFee)
      .catch(() => setProcessingFee(null));
  }, [staffId]);

  const paidTicket = info?.paidTickets.find((t) => t.id === form.ticketTypeId) ?? null;
  const feeNaira = paidTicket && processingFee ? processingFeeNaira(paidTicket.priceNaira, processingFee) : 0;
  const totalNaira = paidTicket ? paidTicket.priceNaira + feeNaira : 0;

  function resetForm() {
    setForm((f) => ({ firstName: "", lastName: "", email: "", phone: "", ticketTypeId: f.ticketTypeId }));
  }

  /** Paid ticket: take the payment on this device first; only once Paystack
   *  confirms it is the attendee registered and checked in. */
  async function takePayment() {
    if (!info || !paidTicket) return;
    setSaving("pay");
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(info.orgSlug)}/ticket-purchase/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: info.eventId,
          ticketTypeId: paidTicket.id,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          kioskStaffId: staffId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.accessCode) throw new Error(json.error || "Couldn't start the payment.");
      const PaystackPop = await loadPaystack();
      const reference: string = json.reference;
      await new Promise<void>((resolve) => {
        new PaystackPop().resumeTransaction(json.accessCode, {
          onSuccess: () => {
            void confirmPaid(reference).finally(resolve);
          },
          onCancel: () => {
            setError("Payment cancelled. Nothing was charged and they aren't registered.");
            resolve();
          },
          onError: (e) => {
            setError(e?.message || "The payment window had a problem. Try again.");
            resolve();
          },
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't start the payment.";
      setError(message);
      onError(message);
    } finally {
      setSaving("");
    }
  }

  /** Confirms the payment with Paystack, which registers and checks them in. */
  async function confirmPaid(reference: string) {
    if (!paidTicket) return;
    setSaving("confirm");
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`/api/paystack/ticket-purchase/verify?reference=${encodeURIComponent(reference)}`).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (json.success) {
        onResult({ outcome: "registered", fullName, referenceId: json.referenceId ?? undefined, ticket: paidTicket.name, paid: true, emailSent: true });
        const qr = json.referenceId ? await brandedQrDataUrl(json.referenceId, { width: 440, margin: 1 }).catch(() => "") : "";
        setPaidDone({ fullName, referenceId: json.referenceId ?? null, ticket: paidTicket.name, qr });
        resetForm();
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    const message = `Paystack hasn't confirmed ${fullName}'s payment yet. Don't charge again: check Scan tickets in a minute with their emailed ticket, or the event's Tickets tab. Ref ${reference}`;
    setError(message);
    onError(message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter their first and last name.");
    if (!isValidEmail(form.email.trim())) return setError("Enter a valid email so they get their ticket.");
    setError("");
    if (paidTicket) return takePayment();
    setSaving("register");
    try {
      const res = await fetch("/api/kiosk/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, ...form, ticketTypeId: form.ticketTypeId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't register this attendee.");
        onError(json.error || "Couldn't register this attendee.");
        return;
      }
      const freeName = info?.freeTickets.find((t) => t.id === form.ticketTypeId)?.name;
      onResult({ outcome: json.outcome, fullName: json.registration.fullName, referenceId: json.registration.referenceId, checkedInAt: json.registration.checkedInAt, emailSent: json.emailSent, ticket: freeName });
      resetForm();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving("");
    }
  }

  if (loadError) {
    return (
      <div className="eb-alert" role="alert">
        <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {loadError}
      </div>
    );
  }
  if (!info) return <div className="eb-card p-8 text-center text-sm text-muted">Loading…</div>;
  const canRegister = info.freeRegistration || info.paidTickets.length > 0;

  if (paidDone) {
    return (
      <div className="eb-card mx-auto max-w-md p-6 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-300" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold text-fg">Paid and checked in</h2>
        <p className="mt-1 text-lg font-semibold text-fg">{paidDone.fullName}</p>
        <TicketTag name={paidDone.ticket} />
        {paidDone.qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={paidDone.qr} alt={`Ticket QR code for ${paidDone.fullName}`} className="eb-light mx-auto mt-5 w-full max-w-[220px] rounded-2xl p-3" />
        )}
        {paidDone.referenceId && <p className="mt-3 font-mono text-lg font-semibold tracking-wider text-fg">{paidDone.referenceId}</p>}
        <p className="mt-2 text-sm text-muted">Their ticket and QR are also in their email. They&apos;re already checked in.</p>
        <button type="button" onClick={() => setPaidDone(null)} className="eb-portal-cta mt-5">
          Next walk-up
        </button>
      </div>
    );
  }
  const allTickets = [
    ...info.freeTickets.map((t) => ({ ...t, label: `${t.name} · Free` })),
    ...info.paidTickets.map((t) => ({ ...t, label: `${t.name} · ${formatNaira(t.priceNaira)}` })),
  ];
  if (info.virtual) return <div className="eb-card p-8 text-center text-sm text-muted">Virtual events don&apos;t have door registration.</div>;

  return (
    <div className={`grid gap-4 ${canRegister && info.sellsGroups ? "lg:grid-cols-[1.2fr_1fr]" : ""}`}>
      {canRegister && (
        <form onSubmit={submit} className="eb-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <UserPlus size={20} className="text-[var(--pt-a)]" aria-hidden="true" /> Register a walk-up
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            {info.paidTickets.length
              ? "Paid tickets are paid for on this device first (card, transfer or USSD). Then they're checked in and get their ticket by email."
              : "They're checked in straight away and get their ticket QR by email."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="wk-first" className="eb-label eb-req">First name</label>
              <input id="wk-first" className="eb-input" autoComplete="off" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wk-last" className="eb-label eb-req">Last name</label>
              <input id="wk-last" className="eb-input" autoComplete="off" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wk-email" className="eb-label eb-req">Email</label>
              <input id="wk-email" type="email" inputMode="email" className="eb-input" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wk-phone" className="eb-label">Phone</label>
              <input id="wk-phone" type="tel" className="eb-input" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: sanitizePhoneInput(e.target.value) })} placeholder="0801 234 5678" />
            </div>
            {allTickets.length > 1 && (
              <div className="sm:col-span-2">
                <label htmlFor="wk-ticket" className="eb-label">Ticket</label>
                <select id="wk-ticket" className="eb-input" value={form.ticketTypeId} onChange={(e) => setForm({ ...form, ticketTypeId: e.target.value })}>
                  {allTickets.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.left === 0}>
                      {`${t.label}${t.left != null ? ` (${t.left} left)` : ""}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {paidTicket && (
              <dl className="space-y-1 rounded-xl border border-line bg-canvas p-3.5 text-sm sm:col-span-2">
                <div className="flex justify-between gap-3 text-fg-2">
                  <dt>{paidTicket.name}</dt>
                  <dd className="tabular-nums">{formatNaira(paidTicket.priceNaira)}</dd>
                </div>
                {feeNaira > 0 && (
                  <div className="flex justify-between gap-3 text-fg-2">
                    <dt>Processing fee</dt>
                    <dd className="tabular-nums">{formatNaira(feeNaira)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-line-soft pt-1.5 font-semibold text-fg">
                  <dt>To pay</dt>
                  <dd className="tabular-nums">{formatNaira(totalNaira)}</dd>
                </div>
              </dl>
            )}
          </div>
          {error && (
            <p className="eb-alert mt-4" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          <button type="submit" disabled={saving !== ""} className="eb-portal-cta mt-5">
            {saving === "pay" ? (
              "Opening payment…"
            ) : saving === "confirm" ? (
              "Confirming payment…"
            ) : saving === "register" ? (
              "Registering…"
            ) : paidTicket ? (
              <span className="inline-flex items-center gap-2">
                <CreditCard size={18} aria-hidden="true" /> {`Take payment · ${formatNaira(totalNaira)}`}
              </span>
            ) : (
              "Register & check in"
            )}
          </button>
        </form>
      )}

      {info.sellsGroups && (
        <div className="eb-card items-center p-5 text-center sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <QrCode size={20} className="text-[var(--pt-a)]" aria-hidden="true" /> Buy at the door
          </h2>
          <p className="mt-1 mb-4 max-w-sm text-sm text-muted">
            For group tickets: ask the walk-up to scan this with their phone, buy the group ticket with each guest&apos;s details, then show you their ticket QR in the Scan tab.
          </p>
          {buyQr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={buyQr} alt="QR code to buy a ticket for this event" className="eb-light w-full max-w-[300px] rounded-2xl p-3" />
          ) : (
            <div className="grid aspect-square w-full max-w-[300px] place-items-center rounded-2xl bg-fill text-sm text-muted">Making QR…</div>
          )}
          <p className="mt-3 max-w-xs break-all text-xs text-subtle">{info.buyUrl}</p>
        </div>
      )}
    </div>
  );
}
