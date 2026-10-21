"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Receipt, X } from "lucide-react";
import type { PaymentMethod, PlatformDocument } from "@/lib/types";
import { PAYMENT_METHOD_LABELS, createReceipt, documentTotal } from "@/lib/platform-documents";
import { PersistError } from "@/lib/store";

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** Records money received against a quote, invoice or proposal and issues its receipt (migration 0134). */
export function PlatformReceiptDialog({
  source,
  received,
  onClose,
  onIssued,
}: {
  source: PlatformDocument;
  /** already received against it, from earlier receipts */
  received: number;
  onClose: () => void;
  onIssued: (receipt: PlatformDocument, sourceStatus: PlatformDocument["status"]) => void;
}) {
  const total = documentTotal(source);
  const balance = Math.max(0, Math.round((total - received) * 100) / 100);
  const [amount, setAmount] = useState(String(balance || total));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = Math.round(Number(amount) * 100) / 100;
  const after = Math.max(0, Math.round((balance - (amountNum || 0)) * 100) / 100);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!(amountNum > 0)) return setError("Enter the amount received.");
    if (!paidOn) return setError("Enter the date it was paid.");
    setError("");
    setSaving(true);
    try {
      const { receipt, sourceStatus } = await createReceipt(source, received, { amountNaira: amountNum, paidOn, method, reference });
      toast.success(`Receipt ${receipt.docNumber} issued`);
      onIssued(receipt, sourceStatus);
    } catch (err) {
      setError(err instanceof PersistError ? err.message : "Couldn't issue the receipt. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-modal-backdrop">
      <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-surface shadow-2xl animate-modal-panel max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-line-soft p-6">
          <h2 className="flex items-center gap-2 font-semibold text-fg">
            <Receipt size={17} className="text-brand-500" aria-hidden="true" /> {`Receipt for ${source.docNumber}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} className="text-subtle" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4 p-6">
          <dl className="space-y-1 rounded-xl border border-line bg-canvas p-3.5 text-sm">
            <div className="flex justify-between gap-3 text-fg-2">
              <dt>{source.docType === "proposal" ? "Proposal total" : source.docType === "quote" ? "Quote total" : "Invoice total"}</dt>
              <dd className="tabular-nums">{naira(total)}</dd>
            </div>
            {received > 0 && (
              <div className="flex justify-between gap-3 text-fg-2">
                <dt>Already received</dt>
                <dd className="tabular-nums">{naira(received)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-line-soft pt-1.5 font-semibold text-fg">
              <dt>Balance due</dt>
              <dd className="tabular-nums">{naira(balance)}</dd>
            </div>
          </dl>
          <div>
            <label htmlFor="rc-amount" className="eb-label eb-req">Amount received (₦)</label>
            <input id="rc-amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="eb-input" />
            <p className="mt-1 text-xs text-subtle">{after > 0 ? `Part payment: ${naira(after)} will still be due.` : "Pays it in full."}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rc-date" className="eb-label eb-req">Date paid</label>
              <input id="rc-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="eb-input" />
            </div>
            <div>
              <label htmlFor="rc-method" className="eb-label eb-req">Paid by</label>
              <select id="rc-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="eb-input">
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="rc-ref" className="eb-label">Payment reference</label>
            <input id="rc-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="e.g. bank transfer ref or POS slip number" className="eb-input" />
          </div>
          {error && (
            <p className="eb-alert" role="alert">{error}</p>
          )}
          <button type="submit" disabled={saving} className="eb-btn eb-btn--primary w-full">
            {saving ? "Issuing…" : "Issue receipt"}
          </button>
        </form>
      </div>
    </div>
  );
}
