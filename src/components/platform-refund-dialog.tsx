"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { formatNaira } from "@/lib/billing";

/** −₦150 rather than ₦-150 */
const naira = (v: number) => (v < 0 ? `−${formatNaira(-v)}` : formatNaira(v));

type Details = {
  reference: string; amount_naira: number; fee_naira: number; status: string; purpose: string; held: boolean; test: boolean; created_at: string;
  buyer: string | null; buyer_email: string | null; group_size: number; event: string | null;
  organization: { id: string; name: string; email: string | null; verified: boolean } | null;
  organizer_balance_naira: number; organizer_already_paid_out: boolean;
  promoter_commission: { naira: number; handle: string | null } | null; refundable: boolean;
};

/**
 * Refund a payment from the platform portal (/api/platform/refund): shows
 * exactly what will happen, asks who carries it when the money is held, and
 * needs a reason. The charge is reversed on Paystack; this can't be undone.
 */
export function PlatformRefundDialog({ reference, onClose, onDone }: { reference: string | null; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [absorb, setAbsorb] = useState<"organizer" | "eventbuddy">("organizer");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when a different payment opens
    setD(null);
    setError(null);
    setReason("");
    fetch(`/api/platform/refund?reference=${encodeURIComponent(reference)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) return setError(j.error || "Couldn't load this payment.");
        setD(j as Details);
        // already paid out: the organizer can't cover it, so default to eventbuddy
        setAbsorb((j as Details).organizer_already_paid_out ? "eventbuddy" : "organizer");
      })
      .catch(() => !cancelled && setError("Couldn't load this payment."));
    return () => {
      cancelled = true;
    };
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reference, sending, onClose]);

  if (!reference) return null;

  async function submit() {
    if (!d) return;
    setSending(true);
    const res = await fetch("/api/platform/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: d.reference, absorb: d.held ? absorb : "organizer", reason }),
    });
    const j = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return toast.error(j.error || "Couldn't refund this payment.");
    toast.success(`${formatNaira(d.amount_naira)} refunded${j.emailSent ? ". The buyer has been emailed." : "."}`);
    onDone();
    onClose();
  }

  const what = d?.purpose === "stand_booking" ? "stand booking" : d && d.group_size > 1 ? `group ticket (${d.group_size} guests)` : "ticket";
  const balanceAfter = d ? d.organizer_balance_naira - d.amount_naira + (d.promoter_commission?.naira ?? 0) : 0;

  return (
    <div className="op-wrap rd-wrap" role="dialog" aria-modal="true" aria-label="Refund payment">
      <button type="button" className="op-backdrop" aria-label="Close" onClick={() => !sending && onClose()} />
      <div className="rd-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-fg">
              <RotateCcw size={17} className="text-rose-300" aria-hidden="true" /> Refund this payment
            </p>
            <p className="mt-0.5 font-mono text-xs text-subtle">{reference}</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} className="op-close" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        {!d && !error && <div className="op-skeleton mt-4 !h-48" aria-busy="true" aria-label="Loading" />}

        {d && (
          <>
            <div className="rd-summary">
              <p className="rd-amount">{formatNaira(d.amount_naira)}</p>
              <p className="text-sm text-fg">
                {d.buyer ?? "Buyer"}
                {d.buyer_email ? <span className="text-muted"> · {d.buyer_email}</span> : null}
              </p>
              <p className="text-xs text-muted">
                {what} · {d.event ?? "event"} · {d.organization?.name ?? "organizer"} · paid {new Date(d.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                {d.test ? " · test payment" : ""}
              </p>
            </div>

            {!d.refundable ? (
              <p className="mt-4 rounded-lg bg-fill p-3 text-sm text-muted">
                This payment is <strong className="text-fg">{d.status}</strong>
                {d.status === "success" ? " but isn't a ticket or stand payment" : ""}, so there&apos;s nothing to refund.
              </p>
            ) : (
              <>
                <ul className="rd-effects">
                  <li>The buyer gets {formatNaira(d.amount_naira)} back on Paystack, to the card or account they paid with.</li>
                  <li>The {what} is cancelled and its {d.purpose === "stand_booking" ? "stand" : "seat"} becomes available again.</li>
                  <li>The buyer and {d.organization?.name ?? "the organizer"} are emailed.</li>
                  {d.promoter_commission && <li>@{d.promoter_commission.handle ?? "promoter"}&apos;s {formatNaira(d.promoter_commission.naira)} commission on it is reversed.</li>}
                  {!d.held && <li>This sale was paid straight to the organizer&apos;s bank at checkout (before held funds), so there&apos;s no eventbuddy balance to adjust.</li>}
                </ul>

                {d.held && (
                  <fieldset className="mt-4">
                    <legend className="mb-2 text-sm font-semibold text-fg">Who carries the refund?</legend>
                    {d.organizer_already_paid_out && (
                      <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-200">
                        <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
                        {d.organization?.name}&apos;s balance ({naira(d.organizer_balance_naira)}) is less than this refund, usually because they&apos;ve already been paid out.
                      </p>
                    )}
                    <label className="rd-choice">
                      <input type="radio" name="absorb" checked={absorb === "organizer"} onChange={() => setAbsorb("organizer")} />
                      <span>
                        <strong>The organizer</strong>
                        <small>
                          Comes off their balance (now {naira(d.organizer_balance_naira)}, then {naira(balanceAfter)}).
                          {balanceAfter < 0 ? " It goes negative; their next sales cover it before they can withdraw." : ""} eventbuddy keeps its {formatNaira(d.fee_naira)} fee.
                        </small>
                      </span>
                    </label>
                    <label className="rd-choice">
                      <input type="radio" name="absorb" checked={absorb === "eventbuddy"} onChange={() => setAbsorb("eventbuddy")} />
                      <span>
                        <strong>eventbuddy</strong>
                        <small>The organizer&apos;s balance stays as it is; eventbuddy pays the {formatNaira(d.amount_naira)} from its own Paystack balance.</small>
                      </span>
                    </label>
                  </fieldset>
                )}

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm font-semibold text-fg">Reason</span>
                  <textarea
                    className="eb-input min-h-[72px] w-full"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    placeholder="e.g. Event cancelled; buyer charged twice; organizer unreachable"
                  />
                  <span className="mt-1 block text-xs text-subtle">Kept on the organizer&apos;s ledger with your name.</span>
                </label>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={onClose} disabled={sending} className="eb-btn eb-btn--ghost">
                    Cancel
                  </button>
                  <button type="button" onClick={submit} disabled={sending || reason.trim().length < 3} className="eb-btn rd-confirm">
                    {sending ? "Refunding…" : `Refund ${formatNaira(d.amount_naira)}`}
                  </button>
                </div>
                <p className="mt-2 text-right text-xs text-subtle">This can&apos;t be undone.</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
