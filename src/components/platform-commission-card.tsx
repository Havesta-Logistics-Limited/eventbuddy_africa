"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgePercent } from "lucide-react";
import { formatNaira, formatTicketFee, ticketFeeMinor, type TicketFee } from "@/lib/billing";

type Commission = {
  orgId: string;
  orgName: string;
  effective: TicketFee;
  source: "exempt" | "custom" | "plan" | "default";
  plan: string;
  standard: TicketFee;
  custom: { percentage: number; flatNaira: number; note: string | null; setAt: string | null } | null;
  feeExempt: boolean;
};

const SOURCE: Record<Commission["source"], string> = {
  exempt: "Fee exempt",
  custom: "Custom agreed rate",
  plan: "Their plan's rate",
  default: "Standard rate",
};

/**
 * An organizer's commission in the platform admin's organizer profile: what
 * they're charged now and why, and a custom agreed rate (migration 0126) that
 * applies from their next ticket or stand sale.
 */
export function PlatformCommissionCard({ orgId }: { orgId: string }) {
  const [c, setC] = useState<Commission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState("");
  const [flat, setFlat] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/platform/org-fee?orgId=${orgId}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(/custom_fee|0126/.test(j.error ?? "") ? "This needs migration 0126 to be run on this database." : j.error || "Couldn't load the commission.");
    setError(null);
    setC(j as Commission);
  }, [orgId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the organizer opens
    load();
  }, [load]);

  function startEdit() {
    if (!c) return;
    const base = c.custom ?? c.standard;
    setPct(String(base.percentage));
    setFlat(String(base.flatNaira));
    setNote(c.custom?.note ?? "");
    setEditing(true);
  }

  async function save(clear = false) {
    setSaving(true);
    const body = clear ? { orgId, percentage: null, flatNaira: null } : { orgId, percentage: Number(pct), flatNaira: Number(flat), note };
    const res = await fetch("/api/platform/org-fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(j.error || `Couldn't save (error ${res.status}).`);
    setC(j as Commission);
    setEditing(false);
    toast.success(clear ? "Back to the standard rate from the next sale" : "Custom rate saved: it applies from the next sale");
  }

  const draft: TicketFee | null = editing && pct !== "" && flat !== "" && Number.isFinite(Number(pct)) && Number.isFinite(Number(flat)) ? { percentage: Number(pct), flatNaira: Number(flat) } : null;
  const example = (fee: TicketFee) => {
    const feeN = ticketFeeMinor(10000, fee) / 100;
    return `On a ₦10,000 ticket: eventbuddy ${formatNaira(feeN)}, organizer ${formatNaira(10000 - feeN)}`;
  };

  return (
    <div className="op-box">
      <p className="op-box-h flex items-center gap-1.5">
        <BadgePercent size={13} aria-hidden="true" /> Commission
      </p>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!c && !error && <p className="text-sm text-muted">Loading…</p>}
      {c && !editing && (
        <>
          <p className="text-lg font-semibold text-fg">{c.source === "exempt" ? "Nothing (fee exempt)" : `${formatTicketFee(c.effective)} per sale`}</p>
          <p className="text-xs text-muted">
            {SOURCE[c.source]}
            {c.source === "plan" ? ` (${c.plan})` : ""}
            {c.source !== "exempt" ? ` · ${example(c.effective)}` : ""}
          </p>
          {c.custom && (
            <p className="mt-2 text-xs text-fg-3">
              {`Agreed: “${c.custom.note ?? ""}”`}
              {c.custom.setAt ? ` · set ${new Date(c.custom.setAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}` : ""}
              {` · their standard rate would be ${formatTicketFee(c.standard)}`}
            </p>
          )}
          {c.feeExempt && c.custom && <p className="mt-1 text-xs text-amber-300">Fee exempt overrides the custom rate while it&apos;s on.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="op-btn" onClick={startEdit}>
              {c.custom ? "Change custom rate" : "Set a custom rate"}
            </button>
            {c.custom && (
              <button type="button" className="op-btn" disabled={saving} onClick={() => save(true)}>
                Back to standard rate
              </button>
            )}
          </div>
        </>
      )}
      {c && editing && (
        <div className="mt-1 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="pe-label">Percentage (%)</span>
              <input className="eb-input" type="number" inputMode="decimal" min={0} max={50} step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} />
            </label>
            <label className="block">
              <span className="pe-label">Plus per sale (₦)</span>
              <input className="eb-input" type="number" inputMode="numeric" min={0} step="10" value={flat} onChange={(e) => setFlat(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="pe-label">The agreement (for your records)</span>
            <input className="eb-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Agreed with Tunde on 15 Oct: 3% + ₦50 for their 2026 shows" />
          </label>
          <p className="text-xs text-muted">{draft ? example(draft) : "Enter a percentage and an amount (0 is allowed)."} Applies from their next ticket or stand sale.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="eb-btn eb-btn--primary" disabled={saving || !draft || note.trim().length < 3} onClick={() => save(false)}>
              {saving ? "Saving…" : "Save custom rate"}
            </button>
            <button type="button" className="eb-btn eb-btn--ghost" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
