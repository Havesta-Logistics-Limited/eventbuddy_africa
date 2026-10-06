"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Send, ShieldCheck, X } from "lucide-react";
import { formatNaira } from "@/lib/billing";
import { PersistError, getPayoutSettings, mapPayoutRow } from "@/lib/store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PayoutRequest, PayoutSettings } from "@/lib/types";

type QueueRow = PayoutRequest & { orgName: string; orgVerified: boolean; availableNaira: number | null; promoterId: string | null };
type BankChange = { id: string; handle: string; full_name: string; payout_bank_name: string | null; payout_account_number: string | null; payout_change_requested_at: string | null };

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; status?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, error: json.error, status: json.status };
}

/** Platform admin → Payouts: the held-funds switch and payout rules, then
 *  every payout request with Send (Paystack Transfer), Mark paid (sent by hand)
 *  and Reject, plus the organizer's payout verification. */
export function PlatformPayoutQueue() {
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [form, setForm] = useState({ held: false, min: "", fee: "", lock: "" });
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);
  const [bankChanges, setBankChanges] = useState<BankChange[]>([]);

  const load = useCallback(async () => {
    try {
      const s = await getPayoutSettings();
      setSettings(s);
      setForm({ held: s.heldFundsEnabled, min: String(s.payoutMinNaira), fee: String(s.payoutFeeNaira), lock: String(s.unverifiedLockDays) });
      const supabase = createSupabaseBrowserClient();
      let q = supabase.from("payout_requests").select("*, organizations(name, payout_verified), promoters(handle, full_name)").order("requested_at", { ascending: false }).limit(200);
      if (filter === "open") q = q.in("status", ["requested", "processing"]);
      const { data, error } = await q;
      if (error) throw new PersistError(error);
      const list = await Promise.all(
        (data ?? []).map(async (p) => {
          const org = p.organizations as unknown as { name: string; payout_verified: boolean } | null;
          const promoter = p.promoters as unknown as { handle: string; full_name: string } | null;
          let availableNaira: number | null = null;
          if (p.status === "requested") {
            const { data: b } = p.promoter_id
              ? await supabase.rpc("promoter_balance", { p_promoter: p.promoter_id }).maybeSingle<{ available_naira: number }>()
              : await supabase.rpc("account_balance", { p_org: p.organization_id }).maybeSingle<{ available_naira: number }>();
            availableNaira = b ? Number(b.available_naira) : null;
          }
          return {
            ...mapPayoutRow(p),
            orgName: promoter ? `${promoter.full_name} (@${promoter.handle}) · promoter` : (org?.name ?? "Unknown organization"),
            orgVerified: Boolean(org?.payout_verified),
            availableNaira,
            promoterId: p.promoter_id ?? null,
          };
        })
      );
      setRows(list);
      const { data: changes } = await supabase
        .from("promoters")
        .select("id, handle, full_name, payout_bank_name, payout_account_number, payout_change_requested_at")
        .eq("payout_change_status", "requested");
      setBankChanges((changes ?? []) as BankChange[]);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load payout requests.");
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  async function saveSettings() {
    const body = { heldFundsEnabled: form.held, payoutMinNaira: Number(form.min), payoutFeeNaira: Number(form.fee), unverifiedLockDays: Number(form.lock) };
    if (form.held && !settings?.heldFundsEnabled && !window.confirm("Turn on held funds? Every new ticket sale will land in eventbuddy's Paystack balance instead of the organizer's bank, and organizers will request payouts.")) return;
    setBusy("settings");
    const res = await post("/api/platform/payouts/settings", body);
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't save payout settings.");
    toast.success("Payout settings saved");
    load();
  }

  async function decide(id: string, action: "transfer" | "mark_paid" | "reject", note?: string) {
    if (action === "mark_paid" && !window.confirm("Mark this payout as paid? Only do this if you've already sent the money yourself.")) return;
    setBusy(id);
    const res = await post("/api/platform/payouts/decide", { payoutId: id, action, note });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't update this payout.");
    toast.success(action === "reject" ? "Payout rejected, money returned to the organizer's balance" : res.status === "paid" ? "Payout marked as paid" : "Transfer sent to Paystack");
    setRejecting(null);
    load();
  }

  async function decideBankChange(promoterId: string, action: "approve" | "decline") {
    setBusy(promoterId);
    const res = await post("/api/platform/payouts/promoter-bank", { promoterId, action });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't update the request.");
    toast.success(action === "approve" ? "Approved: the promoter can now enter their new bank account" : "Bank change declined");
    load();
  }

  async function setVerified(orgId: string, verified: boolean) {
    setBusy(orgId);
    const res = await post("/api/platform/payouts/verify-org", { orgId, verified });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't update verification.");
    toast.success(verified ? "Organizer verified for early payouts" : "Verification removed");
    load();
  }

  return (
    <div className="mb-8 space-y-6">
      <section className="eb-card p-5">
        <h2 className="text-sm font-semibold text-fg">Held funds and payout rules</h2>
        <p className="mt-1 text-xs text-muted">
          {settings?.heldFundsEnabled
            ? `On since ${settings.heldFundsSince ? new Date(settings.heldFundsSince).toLocaleString("en-GB") : "—"}: new ticket sales land in eventbuddy's Paystack balance and organizers request payouts.`
            : "Off: ticket sales still split straight to each organizer's bank at checkout."}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <label className="flex items-center gap-2.5 text-sm text-fg-2 sm:col-span-4">
            <input type="checkbox" checked={form.held} onChange={(e) => setForm({ ...form, held: e.target.checked })} className="h-4 w-4" />
            Hold all ticket money and pay out on request
          </label>
          <div>
            <label htmlFor="po-min" className="eb-label">Minimum payout (₦)</label>
            <input id="po-min" type="number" min="0" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} className="eb-input" />
          </div>
          <div>
            <label htmlFor="po-fee" className="eb-label">Fee per payout (₦)</label>
            <input id="po-fee" type="number" min="0" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} className="eb-input" />
          </div>
          <div>
            <label htmlFor="po-lock" className="eb-label">Unverified lock (days after event)</label>
            <input id="po-lock" type="number" min="0" max="60" value={form.lock} onChange={(e) => setForm({ ...form, lock: e.target.value })} className="eb-input" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={saveSettings} disabled={busy === "settings"} className="eb-btn eb-btn--primary w-full">
              {busy === "settings" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">Payout requests</h2>
          <div className="eb-seg" role="group" aria-label="Filter payout requests">
            {(["open", "all"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "open" ? "Waiting" : "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="eb-card divide-y divide-line-soft">
          {rows.length === 0 ? (
            <p className="p-5 text-sm text-muted">{filter === "open" ? "No payouts waiting for approval." : "No payout requests yet."}</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                      {r.orgName}
                      {r.orgVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          <ShieldCheck size={11} aria-hidden="true" /> Verified
                        </span>
                      )}
                      <span className="eb-payout-status" data-status={r.status}>{r.status}</span>
                    </p>
                    <p className="mt-1 text-sm text-fg-2">
                      <span className="font-semibold tabular-nums">{formatNaira(r.amountNaira)}</span> to {r.bankName} ••••{r.accountNumberLast4}
                      {r.accountName && <span className="text-muted"> ({r.accountName})</span>}
                    </p>
                    <p className="text-xs text-muted">
                      Requested {new Date(r.requestedAt).toLocaleString("en-GB")} · fee {formatNaira(r.feeNaira)}
                      {r.availableNaira != null && ` · ${formatNaira(r.availableNaira)} still available after this request`}
                    </p>
                    {r.availableNaira != null && r.availableNaira < 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-rose-300">
                        <AlertCircle size={12} aria-hidden="true" /> Their balance went negative after this request (a refund since). Check before paying.
                      </p>
                    )}
                    {(r.failureReason || r.decisionNote) && <p className="mt-1 text-xs text-subtle">{r.failureReason || r.decisionNote}</p>}
                  </div>
                  {r.status === "requested" && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy === r.id} onClick={() => decide(r.id, "transfer")} className="eb-btn eb-btn--primary">
                        <Send size={14} aria-hidden="true" /> Send via Paystack
                      </button>
                      <button type="button" disabled={busy === r.id} onClick={() => decide(r.id, "mark_paid")} className="eb-btn eb-btn--ghost">
                        <Check size={14} aria-hidden="true" /> Mark paid
                      </button>
                      <button type="button" disabled={busy === r.id} onClick={() => setRejecting({ id: r.id, note: "" })} className="eb-btn eb-btn--ghost">
                        <X size={14} aria-hidden="true" /> Reject
                      </button>
                    </div>
                  )}
                </div>
                {rejecting?.id === r.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={rejecting.note}
                      onChange={(e) => setRejecting({ id: r.id, note: e.target.value })}
                      placeholder="Reason the organizer will see"
                      className="eb-input min-w-0 flex-1"
                      aria-label="Reason for rejecting"
                    />
                    <button type="button" disabled={!rejecting.note.trim() || busy === r.id} onClick={() => decide(r.id, "reject", rejecting.note.trim())} className="eb-btn eb-btn--primary">
                      Reject payout
                    </button>
                    <button type="button" onClick={() => setRejecting(null)} className="eb-btn eb-btn--ghost">
                      Cancel
                    </button>
                  </div>
                )}
                {!r.promoterId && (
                  <button type="button" disabled={busy === r.organizationId} onClick={() => setVerified(r.organizationId, !r.orgVerified)} className="eb-link mt-2 text-xs">
                    {r.orgVerified ? "Remove payout verification" : "Verify this organizer for early payouts"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {bankChanges.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">Promoter bank changes</h2>
          <div className="eb-card divide-y divide-line-soft">
            {bankChanges.map((b) => (
              <div key={b.id} className="flex flex-row flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">
                    {b.full_name} <span className="font-normal text-muted">@{b.handle}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Currently {b.payout_bank_name} ••••{(b.payout_account_number ?? "").slice(-4)}
                    {b.payout_change_requested_at && ` · asked ${new Date(b.payout_change_requested_at).toLocaleDateString("en-GB")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === b.id} onClick={() => decideBankChange(b.id, "approve")} className="eb-btn eb-btn--primary">
                    Allow change
                  </button>
                  <button type="button" disabled={busy === b.id} onClick={() => decideBankChange(b.id, "decline")} className="eb-btn eb-btn--ghost">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
