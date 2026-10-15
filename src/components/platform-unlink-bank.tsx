"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, X } from "lucide-react";

export type UnlinkTarget = { orgId: string; orgName: string; bank: string | null; last4: string | null };

/**
 * Confirm removing an organizer's payout bank account (/api/platform/unlink-bank):
 * says what happens, needs a reason, and emails the organizer.
 */
export function PlatformUnlinkBank({ target, onClose, onDone }: { target: UnlinkTarget | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh form for each organizer
    setReason("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, busy, onClose]);

  if (!target) return null;
  const account = `${target.bank ?? "Bank account"}${target.last4 ? ` ••${target.last4}` : ""}`;

  async function unlink() {
    if (!target) return;
    setBusy(true);
    const res = await fetch("/api/platform/unlink-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: target.orgId, reason }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(j.error || `Couldn't unlink the bank account (error ${res.status}).`);
    toast.success(`${target.orgName}'s bank account unlinked${j.emailed ? "; they've been emailed" : ""}`);
    onDone();
    onClose();
  }

  return (
    <div className="op-wrap rd-wrap" role="dialog" aria-modal="true" aria-label="Unlink bank account">
      <button type="button" className="op-backdrop" aria-label="Close" onClick={() => !busy && onClose()} />
      <div className="rd-panel">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-base font-semibold text-fg">
            <Landmark size={17} className="text-rose-300" aria-hidden="true" /> Unlink bank account
          </p>
          <button type="button" onClick={onClose} disabled={busy} className="op-close" aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="rd-summary">
          <p className="text-base font-semibold text-fg">{target.orgName}</p>
          <p className="text-sm text-muted">{account}</p>
        </div>
        <ul className="rd-effects">
          <li>The bank details are removed, and eventbuddy can&apos;t send payouts until they add a new account.</li>
          <li>They can&apos;t sell paid tickets until then either. Free tickets keep working.</li>
          <li>Their balance is untouched; nothing is taken from it.</li>
          <li>Their Paystack subaccount is switched off, and they&apos;re emailed your reason.</li>
        </ul>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-semibold text-fg">Reason (sent to the organizer)</span>
          <textarea
            className="eb-input min-h-[72px] w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="e.g. The account name doesn't match the organizer; please add an account in your business's name."
          />
        </label>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="eb-btn eb-btn--ghost">
            Cancel
          </button>
          <button type="button" onClick={unlink} disabled={busy || reason.trim().length < 3} className="eb-btn rd-confirm">
            {busy ? "Unlinking…" : "Unlink bank account"}
          </button>
        </div>
      </div>
    </div>
  );
}
