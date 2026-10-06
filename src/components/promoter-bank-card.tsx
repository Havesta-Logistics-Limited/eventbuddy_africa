"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Landmark } from "lucide-react";
import { PersistError, getMyPromoter, type PromoterProfile } from "@/lib/store";

type BankOption = { name: string; code: string };

async function post(body: unknown) {
  const res = await fetch("/api/promoters/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json } as { ok: boolean; error?: string; accountName?: string };
}

/** A promoter's payout bank account: add it once (verified against the bank,
 *  the real account name shown before saving), after that only change it once
 *  a platform admin approves the request. */
export function PromoterBankCard({ onChanged }: { onChanged?: () => void }) {
  const [me, setMe] = useState<PromoterProfile | null>(null);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMe(await getMyPromoter());
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load your bank account.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  async function startEditing() {
    setEditing(true);
    if (banks.length) return;
    const res = await fetch("/api/paystack/banks").then((r) => r.json()).catch(() => ({}));
    setBanks(res.banks ?? []);
  }

  async function verify() {
    setError("");
    setResolvedName("");
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) return setError("Choose your bank and enter your 10-digit account number.");
    setBusy(true);
    const res = await post({ action: "resolve", bankCode, bankName: banks.find((b) => b.code === bankCode)?.name, accountNumber });
    setBusy(false);
    if (!res.ok) return setError(res.error || "Couldn't verify that account.");
    setResolvedName(res.accountName ?? "");
  }

  async function save() {
    setBusy(true);
    const res = await post({ action: "save", bankCode, bankName: banks.find((b) => b.code === bankCode)?.name, accountNumber });
    setBusy(false);
    if (!res.ok) return setError(res.error || "Couldn't save your bank account.");
    toast.success("Bank account saved");
    setEditing(false);
    setResolvedName("");
    await load();
    onChanged?.();
  }

  async function requestChange() {
    setBusy(true);
    const res = await post({ action: "request-change" });
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Couldn't request a change.");
    toast.success("Change requested. We'll let you update it once approved.");
    await load();
    onChanged?.();
  }

  const canEdit = !me?.accountLast4 || me.bankChangeStatus === "approved";

  return (
    <div className="eb-card p-5">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
        <Landmark size={15} aria-hidden="true" /> Payout account
      </p>
      {me?.accountLast4 && !editing && (
        <p className="text-sm text-fg-2">
          {me.bankName} · ••••{me.accountLast4}
          {me.accountName && <span className="block text-xs text-muted">{me.accountName}</span>}
        </p>
      )}
      {!me?.accountLast4 && !editing && <p className="text-sm text-muted">Add the bank account your payouts go to.</p>}

      {editing ? (
        <div className="mt-2 space-y-3">
          <div>
            <label htmlFor="pb-bank" className="eb-label">Bank</label>
            <select id="pb-bank" value={bankCode} onChange={(e) => { setBankCode(e.target.value); setResolvedName(""); }} className="eb-input" required>
              <option value="" disabled>{banks.length ? "Choose your bank" : "Loading banks…"}</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pb-acct" className="eb-label">Account number</label>
            <input id="pb-acct" inputMode="numeric" value={accountNumber} onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setResolvedName(""); }} placeholder="0123456789" className="eb-input" />
          </div>
          {resolvedName && (
            <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Account name: <strong>{resolvedName}</strong>. Is this you?
            </p>
          )}
          {error && (
            <p className="eb-alert flex items-start gap-2" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="eb-btn eb-btn--ghost flex-1" onClick={() => setEditing(false)}>Cancel</button>
            {resolvedName ? (
              <button type="button" className="eb-btn eb-btn--primary flex-1" disabled={busy} onClick={save}>{busy ? "Saving…" : "Yes, save it"}</button>
            ) : (
              <button type="button" className="eb-btn eb-btn--primary flex-1" disabled={busy} onClick={verify}>{busy ? "Checking…" : "Verify account"}</button>
            )}
          </div>
        </div>
      ) : canEdit ? (
        <button type="button" onClick={startEditing} className="eb-link mt-3 self-start text-sm">
          {me?.accountLast4 ? "Enter your new bank account" : "Add bank account"}
        </button>
      ) : me?.bankChangeStatus === "requested" ? (
        <p className="mt-3 self-start text-xs text-subtle">Change requested. You can update it once eventbuddy approves.</p>
      ) : (
        <button type="button" onClick={requestChange} disabled={busy} className="eb-link mt-3 self-start text-sm">
          Request a bank account change
        </button>
      )}
    </div>
  );
}
