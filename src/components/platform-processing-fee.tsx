"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchProcessingFee, formatNaira, processingFeeNaira, type ProcessingFee } from "@/lib/billing";

/** Platform → Payouts: whether buyers pay the card processing on top of a paid
 *  ticket (migration 0130), and the Paystack rate it passes on. */
export function PlatformProcessingFee() {
  const [saved, setSaved] = useState<ProcessingFee | null>(null);
  const [form, setForm] = useState({ enabled: true, pct: "1.5", flat: "100", waive: "2500", cap: "2000" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProcessingFee()
      .then((p) => {
        setSaved(p);
        setForm({ enabled: p.enabled, pct: String(p.percentage), flat: String(p.flatNaira), waive: String(p.flatWaivedBelowNaira), cap: String(p.capNaira) });
      })
      .catch(() => {});
  }, []);

  const preview: ProcessingFee = {
    enabled: true,
    percentage: Number(form.pct) || 0,
    flatNaira: Number(form.flat) || 0,
    flatWaivedBelowNaira: Number(form.waive) || 0,
    capNaira: Number(form.cap) || 0,
  };

  async function save() {
    if (!form.enabled && saved?.enabled && !window.confirm("Stop charging buyers the processing fee? eventbuddy will pay Paystack's charges out of its own fee again.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/processing-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: form.enabled, percentage: preview.percentage, flatNaira: preview.flatNaira, flatWaivedBelowNaira: preview.flatWaivedBelowNaira, capNaira: preview.capNaira }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Couldn't save (error ${res.status}).`);
      setSaved({ ...preview, enabled: form.enabled });
      toast.success(form.enabled ? "Buyers now pay the processing fee on new sales." : "Processing fee off: eventbuddy pays Paystack's charges.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="eb-card p-5">
      <h2 className="text-sm font-semibold text-fg">Processing fee</h2>
      <p className="mt-1 text-xs text-muted">
        {saved?.enabled
          ? "On: buyers pay Paystack's charge on top of each paid ticket, so the full ticket price reaches eventbuddy. It isn't refunded."
          : "Off: Paystack's charge on each ticket payment comes out of eventbuddy's fee."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <label className="flex items-center gap-2.5 text-sm text-fg-2 sm:col-span-4">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4" />
          Buyers pay the processing fee
        </label>
        <div>
          <label htmlFor="pf-pct" className="eb-label">Paystack rate (%)</label>
          <input id="pf-pct" type="number" min="0" max="10" step="0.1" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} className="eb-input" />
        </div>
        <div>
          <label htmlFor="pf-flat" className="eb-label">Plus per payment (₦)</label>
          <input id="pf-flat" type="number" min="0" value={form.flat} onChange={(e) => setForm({ ...form, flat: e.target.value })} className="eb-input" />
        </div>
        <div>
          <label htmlFor="pf-waive" className="eb-label">No flat part under (₦)</label>
          <input id="pf-waive" type="number" min="0" value={form.waive} onChange={(e) => setForm({ ...form, waive: e.target.value })} className="eb-input" />
        </div>
        <div>
          <label htmlFor="pf-cap" className="eb-label">Capped at (₦)</label>
          <input id="pf-cap" type="number" min="0" value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} className="eb-input" />
        </div>
        <p className="text-xs text-subtle sm:col-span-3">
          Buyer pays on top: {[1000, 8000, 10000, 75000, 500000].map((n) => `${formatNaira(n)} → ${formatNaira(processingFeeNaira(n, preview))}`).join(" · ")}
        </p>
        <button type="button" onClick={save} disabled={busy} className="eb-btn eb-btn--primary w-full">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
