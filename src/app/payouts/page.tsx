"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Clock, Landmark, Lock, ShieldCheck, Wallet, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { AuthLoading } from "@/components/auth-loading";
import { useRequireRole } from "@/lib/auth";
import { formatNaira } from "@/lib/billing";
import {
  PersistError,
  cancelPayout,
  getAccountBalance,
  getMyLedgerEntries,
  getMyPayoutRequests,
  getPayoutSettings,
  requestPayout,
  resolveMyOrgId,
} from "@/lib/store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AccountBalance, LedgerEntry, LedgerKind, PayoutRequest, PayoutSettings, PayoutStatus, Role } from "@/lib/types";

const ADMIN_ONLY: Role[] = ["admin"];

const KIND_LABEL: Record<LedgerKind, string> = {
  sale: "Ticket sale",
  fee: "eventbuddy fee",
  refund: "Refund",
  dispute: "Disputed payment",
  payout: "Payout",
  payout_fee: "Payout fee",
  payout_return: "Payout returned",
  payout_fee_return: "Payout fee returned",
  adjustment: "Adjustment",
};

const STATUS_LABEL: Record<PayoutStatus, string> = {
  requested: "Waiting for approval",
  processing: "Sending to your bank",
  paid: "Paid",
  failed: "Failed, returned to balance",
  rejected: "Rejected, returned to balance",
  cancelled: "Cancelled",
};

type Bank = { name: string | null; last4: string | null; accountName: string | null; verified: boolean; changePending: boolean };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PayoutsPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [bank, setBank] = useState<Bank | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const orgId = await resolveMyOrgId(supabase);
      const [s, b, p, e, org] = await Promise.all([
        getPayoutSettings(),
        getAccountBalance(),
        getMyPayoutRequests(),
        getMyLedgerEntries(),
        orgId
          ? supabase
              .from("organizations_payout_masked")
              .select("payout_bank_name, payout_account_number_masked, payout_account_name, payout_change_status")
              .eq("id", orgId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      let verified = false;
      if (orgId) {
        const { data: v } = await supabase.from("organizations").select("payout_verified").eq("id", orgId).maybeSingle();
        verified = Boolean(v?.payout_verified);
      }
      setSettings(s);
      setBalance(b);
      setPayouts(p);
      setEntries(e);
      const o = org.data as { payout_bank_name: string | null; payout_account_number_masked: string | null; payout_account_name: string | null; payout_change_status: string } | null;
      setBank({
        name: o?.payout_bank_name ?? null,
        last4: o?.payout_account_number_masked ? o.payout_account_number_masked.slice(-4) : null,
        accountName: o?.payout_account_name ?? null,
        verified,
        changePending: o?.payout_change_status === "requested",
      });
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load your payouts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    if (session) load();
  }, [session, load]);

  if (!session) return <AuthLoading />;

  const open = payouts.find((p) => p.status === "requested" || p.status === "processing");
  const available = Math.max(0, balance?.availableNaira ?? 0);
  const withdrawable = settings ? Math.max(0, available - settings.payoutFeeNaira) : 0;
  const canRequest = Boolean(settings?.heldFundsEnabled && bank?.last4 && !bank.changePending && !open && settings && withdrawable >= settings.payoutMinNaira);

  async function onCancel(id: string) {
    try {
      await cancelPayout(id);
      toast.success("Payout cancelled. The money is back in your balance.");
      load();
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't cancel this payout.");
    }
  }

  return (
    <Shell>
      <div className="eb-app-page p-6 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="eb-app-title">Payouts</h1>
          <p className="eb-app-sub">Your ticket money, what you can withdraw now, and every payout you&apos;ve requested.</p>
        </div>

        {!loading && settings && !settings.heldFundsEnabled && (
          <div className="eb-alert mb-6 flex items-start gap-2.5">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Right now each ticket sale is paid straight to your bank account by Paystack. Your balance and payout requests will appear here once eventbuddy switches to held payouts.</p>
          </div>
        )}

        <section className="eb-wallet mb-6" aria-label="Balance">
          <div className="eb-wallet-main">
            <p className="eb-wallet-label">
              <Wallet size={15} aria-hidden="true" /> Available to withdraw
            </p>
            <p className="eb-wallet-amount">{loading ? "…" : formatNaira(available)}</p>
            {balance && balance.availableNaira < 0 && (
              <p className="mt-1 text-xs text-rose-300">You owe {formatNaira(-balance.availableNaira)} from a refund after your last payout. New sales cover it first.</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" className="eb-btn eb-btn--primary" disabled={!canRequest} onClick={() => setShowRequest(true)}>
                <ArrowUpRight size={16} aria-hidden="true" /> Request payout
              </button>
              {settings && (
                <span className="text-xs text-muted">
                  Minimum {formatNaira(settings.payoutMinNaira)} · {formatNaira(settings.payoutFeeNaira)} fee per payout
                </span>
              )}
            </div>
            {!loading && settings?.heldFundsEnabled && !canRequest && (
              <p className="mt-3 text-xs text-subtle">
                {!bank?.last4
                  ? "Add your bank account in Settings to request payouts."
                  : bank.changePending
                    ? "Your bank account change is waiting for approval."
                    : open
                      ? "You have a payout in progress."
                      : `You can request a payout once at least ${formatNaira(settings.payoutMinNaira + settings.payoutFeeNaira)} is available.`}
              </p>
            )}
          </div>
          <div className="eb-wallet-side">
            <div className="eb-wallet-stat">
              <Clock size={15} aria-hidden="true" />
              <div>
                <p>{formatNaira(balance?.pendingNaira ?? 0)}</p>
                <span>Clearing: available from the next business day</span>
              </div>
            </div>
            <div className="eb-wallet-stat">
              <Lock size={15} aria-hidden="true" />
              <div>
                <p>{formatNaira(balance?.lockedNaira ?? 0)}</p>
                <span>
                  {bank?.verified
                    ? "Locked: none, your account is verified"
                    : `Locked until ${settings?.unverifiedLockDays ?? 3} days after each event ends`}
                </span>
              </div>
            </div>
            <div className="eb-wallet-stat">
              <ArrowDownLeft size={15} aria-hidden="true" />
              <div>
                <p>{formatNaira(balance?.paidOutNaira ?? 0)}</p>
                <span>Paid out and requested so far</span>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="eb-card p-5">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
              <Landmark size={15} aria-hidden="true" /> Payout account
            </p>
            {bank?.last4 ? (
              <p className="text-sm text-fg-2">
                {bank.name} · ••••{bank.last4}
                {bank.accountName && <span className="block text-xs text-muted">{bank.accountName}</span>}
              </p>
            ) : (
              <p className="text-sm text-muted">No bank account yet.</p>
            )}
            <Link href="/admin?tab=payouts" className="eb-link mt-3 inline-block text-sm">
              {bank?.last4 ? "Change bank account" : "Add bank account"}
            </Link>
          </div>
          <div className="eb-card p-5">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
              <ShieldCheck size={15} aria-hidden="true" /> {bank?.verified ? "Verified organizer" : "Not verified yet"}
            </p>
            <p className="text-sm text-muted">
              {bank?.verified
                ? "You can withdraw cleared money from live events without waiting for them to end."
                : "Money from an event unlocks a few days after it ends. Verified organizers can withdraw cleared money during live events. Contact eventbuddy support to get verified."}
            </p>
          </div>
        </div>

        {open && (
          <div className="eb-card mb-6 flex flex-row flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold text-fg">
                {formatNaira(open.amountNaira)} to {open.bankName} ••••{open.accountNumberLast4}
              </p>
              <p className="text-xs text-muted">
                {STATUS_LABEL[open.status]} · requested {when(open.requestedAt)}
              </p>
            </div>
            {open.status === "requested" && (
              <button type="button" className="eb-btn eb-btn--ghost" onClick={() => onCancel(open.id)}>
                Cancel request
              </button>
            )}
          </div>
        )}

        <h2 className="mb-3 text-sm font-semibold text-fg">Payout history</h2>
        <div className="eb-card mb-8 divide-y divide-line-soft">
          {payouts.length === 0 ? (
            <p className="p-5 text-sm text-muted">No payouts yet.</p>
          ) : (
            payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{formatNaira(p.amountNaira)}</p>
                  <p className="text-xs text-muted">
                    {when(p.requestedAt)} · {p.bankName} ••••{p.accountNumberLast4}
                  </p>
                  {(p.failureReason || (p.status === "rejected" && p.decisionNote)) && (
                    <p className="mt-0.5 text-xs text-rose-300">{p.failureReason || p.decisionNote}</p>
                  )}
                </div>
                <span className="eb-payout-status" data-status={p.status}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
            ))
          )}
        </div>

        <h2 className="mb-3 text-sm font-semibold text-fg">Balance activity</h2>
        <div className="eb-card divide-y divide-line-soft">
          {entries.length === 0 ? (
            <p className="p-5 text-sm text-muted">Ticket sales, fees, refunds and payouts will show up here.</p>
          ) : (
            entries.map((e) => {
              const clearing = e.amountNaira > 0 && new Date(e.clearsAt) > new Date();
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">
                      {KIND_LABEL[e.kind]}
                      {e.eventName && <span className="text-muted"> · {e.eventName}</span>}
                    </p>
                    <p className="text-xs text-subtle">
                      {when(e.createdAt)}
                      {clearing && ` · clears ${when(e.clearsAt)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${e.amountNaira >= 0 ? "text-emerald-300" : "text-fg-2"}`}>
                    {e.amountNaira >= 0 ? "+" : "−"}
                    {formatNaira(Math.abs(e.amountNaira))}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showRequest && settings && bank && (
        <RequestPayoutModal
          available={available}
          settings={settings}
          bank={bank}
          onClose={() => setShowRequest(false)}
          onDone={() => {
            setShowRequest(false);
            load();
          }}
        />
      )}
    </Shell>
  );
}

function RequestPayoutModal({ available, settings, bank, onClose, onDone }: { available: number; settings: PayoutSettings; bank: Bank; onClose: () => void; onDone: () => void }) {
  const max = Math.max(0, Math.floor((available - settings.payoutFeeNaira) * 100) / 100);
  const [amount, setAmount] = useState(String(Math.floor(max)));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const value = Number(amount) || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value < settings.payoutMinNaira) return setError(`The minimum payout is ${formatNaira(settings.payoutMinNaira)}.`);
    if (value > max) return setError(`You can request up to ${formatNaira(max)} (your balance minus the ${formatNaira(settings.payoutFeeNaira)} fee).`);
    setError("");
    setSaving(true);
    try {
      await requestPayout(value);
      toast.success("Payout requested. We'll let you know once it's approved.");
      onDone();
    } catch (err) {
      setError(err instanceof PersistError ? err.message : "Couldn't request this payout. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="payout-title">
      <form onSubmit={submit} className="animate-modal-panel w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="payout-title" className="font-display text-2xl text-fg">Request payout</h2>
            <p className="mt-1 text-sm text-muted">
              To {bank.name} ••••{bank.last4}
            </p>
          </div>
          <button type="button" onClick={onClose} className="eb-iconbtn" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label htmlFor="payout-amount" className="eb-label">
          Amount (₦)
        </label>
        <div className="flex gap-2">
          <input id="payout-amount" type="number" min={settings.payoutMinNaira} max={max} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="eb-input flex-1" />
          <button type="button" className="eb-btn eb-btn--ghost" onClick={() => setAmount(String(max))}>
            Max
          </button>
        </div>
        <dl className="mt-4 space-y-1.5 rounded-xl bg-fill p-4 text-sm">
          <div className="flex justify-between text-fg-2">
            <dt>Sent to your bank</dt>
            <dd className="tabular-nums">{formatNaira(value)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Payout fee</dt>
            <dd className="tabular-nums">{formatNaira(settings.payoutFeeNaira)}</dd>
          </div>
          <div className="flex justify-between border-t border-line-soft pt-1.5 font-semibold text-fg">
            <dt>Taken from your balance</dt>
            <dd className="tabular-nums">{formatNaira(value + settings.payoutFeeNaira)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-subtle">eventbuddy reviews every payout. Once approved it usually reaches your bank within 2 to 24 hours.</p>
        {error && (
          <div className="eb-alert mt-4 flex items-start gap-2" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="eb-btn eb-btn--ghost flex-1">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="eb-btn eb-btn--primary flex-1">
            {saving ? "Requesting…" : "Request payout"}
          </button>
        </div>
      </form>
    </div>
  );
}
