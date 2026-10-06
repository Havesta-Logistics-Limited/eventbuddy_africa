"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PersistError, getOrganizerPlans } from "@/lib/store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OrganizerPlan, PlanId } from "@/lib/types";

type Draft = { price: string; pct: string; flat: string; promoters: string };

async function post(body: unknown) {
  const res = await fetch("/api/platform/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, error: json.error as string | undefined };
}

/** Platform admin → Billing: edit Launch/Grow/Scale, publish paid plans to
 *  Paystack so organizers can subscribe, and put an organization on a plan
 *  directly (comped, no payment). */
export function PlatformPlansEditor() {
  const [plans, setPlans] = useState<OrganizerPlan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [orgs, setOrgs] = useState<{ id: string; name: string; plan_id: string; plan_comped: boolean }[]>([]);
  const [assign, setAssign] = useState<{ orgId: string; planId: PlanId }>({ orgId: "", planId: "grow" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getOrganizerPlans();
      setPlans(p);
      setDrafts(
        Object.fromEntries(
          p.map((x) => [x.id, { price: String(x.priceMonthlyNaira), pct: x.feePercentage == null ? "" : String(x.feePercentage), flat: x.feeFlatNaira == null ? "" : String(x.feeFlatNaira), promoters: x.maxPromotersPerEvent == null ? "" : String(x.maxPromotersPerEvent) }])
        )
      );
      const { data } = await createSupabaseBrowserClient().from("organizations").select("id, name, plan_id, plan_comped").order("name");
      setOrgs(data ?? []);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load plans.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  async function save(p: OrganizerPlan, syncPaystack: boolean) {
    const d = drafts[p.id];
    if (syncPaystack && !window.confirm(`Publish ${p.name} at ₦${Number(d.price).toLocaleString()}/month to Paystack? Organizers will be able to subscribe and be charged for it.`)) return;
    setBusy(p.id);
    const res = await post({
      action: "save",
      planId: p.id,
      priceMonthlyNaira: Number(d.price) || 0,
      feePercentage: d.pct.trim() === "" ? null : Number(d.pct),
      feeFlatNaira: d.flat.trim() === "" ? null : Number(d.flat),
      maxPromotersPerEvent: d.promoters.trim() === "" ? null : Number(d.promoters),
      syncPaystack,
    });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't save the plan.");
    toast.success(syncPaystack ? `${p.name} saved and published to Paystack` : `${p.name} saved`);
    load();
  }

  async function assignPlan() {
    if (!assign.orgId) return;
    setBusy("assign");
    const res = await post({ action: "assign", orgId: assign.orgId, planId: assign.planId });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't assign the plan.");
    toast.success("Plan assigned");
    load();
  }

  const set = (id: string, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  return (
    <section className="mb-8">
      <h2 className="font-semibold text-fg mb-1">Organizer plans</h2>
      <p className="text-xs text-muted mb-4">
        Each plan&apos;s monthly price, ticket fee and promoter limit. Launch&apos;s ticket fee is the default fee above. Paid plans need publishing to
        Paystack before organizers can subscribe; leave the promoter limit empty for unlimited.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const d = drafts[p.id];
          if (!d) return null;
          return (
            <div key={p.id} className="eb-card p-4">
              <p className="mb-3 flex items-center justify-between text-sm font-semibold text-fg">
                {p.name}
                {p.id !== "launch" && <span className="text-[11px] font-medium text-subtle">{p.purchasable ? "On Paystack" : "Not on Paystack yet"}</span>}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="eb-label" htmlFor={`pl-${p.id}-price`}>Price per month (₦)</label>
                  <input id={`pl-${p.id}-price`} type="number" min="0" disabled={p.id === "launch"} value={d.price} onChange={(e) => set(p.id, { price: e.target.value })} className="eb-input" />
                </div>
                <div>
                  <label className="eb-label" htmlFor={`pl-${p.id}-pct`}>Fee %</label>
                  <input id={`pl-${p.id}-pct`} type="number" min="0" max="100" step="0.01" disabled={p.id === "launch"} placeholder={p.id === "launch" ? "Default" : ""} value={d.pct} onChange={(e) => set(p.id, { pct: e.target.value })} className="eb-input" />
                </div>
                <div>
                  <label className="eb-label" htmlFor={`pl-${p.id}-flat`}>Fee + ₦</label>
                  <input id={`pl-${p.id}-flat`} type="number" min="0" disabled={p.id === "launch"} placeholder={p.id === "launch" ? "Default" : ""} value={d.flat} onChange={(e) => set(p.id, { flat: e.target.value })} className="eb-input" />
                </div>
                <div className="col-span-2">
                  <label className="eb-label" htmlFor={`pl-${p.id}-prom`}>Promoters per event</label>
                  <input id={`pl-${p.id}-prom`} type="number" min="0" placeholder="Unlimited" value={d.promoters} onChange={(e) => set(p.id, { promoters: e.target.value })} className="eb-input" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy === p.id} onClick={() => save(p, false)} className="eb-btn eb-btn--ghost flex-1">
                  Save
                </button>
                {p.id !== "launch" && (
                  <button type="button" disabled={busy === p.id} onClick={() => save(p, true)} className="eb-btn eb-btn--primary flex-1">
                    {p.purchasable ? "Save + update Paystack" : "Publish to Paystack"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="eb-card mt-4 p-4">
        <p className="text-sm font-semibold text-fg">Put an organization on a plan</p>
        <p className="mb-3 text-xs text-muted">No payment is taken. Useful for partners and for testing a plan&apos;s fee and limits.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <select value={assign.orgId} onChange={(e) => setAssign({ ...assign, orgId: e.target.value })} className="eb-input" aria-label="Organization">
            <option value="">Choose an organization…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.plan_id}
                {o.plan_comped ? ", comped" : ""})
              </option>
            ))}
          </select>
          <select value={assign.planId} onChange={(e) => setAssign({ ...assign, planId: e.target.value as PlanId })} className="eb-input" aria-label="Plan">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!assign.orgId || busy === "assign"} onClick={assignPlan} className="eb-btn eb-btn--primary">
            Assign plan
          </button>
        </div>
      </div>
    </section>
  );
}
