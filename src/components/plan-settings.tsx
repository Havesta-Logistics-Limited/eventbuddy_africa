"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import { formatNaira, formatTicketFee, fetchCurrentTicketFee, planTicketFee, type TicketFee } from "@/lib/billing";
import { PersistError, getMyPlan, getOrganizerPlans } from "@/lib/store";
import type { MyPlan, OrganizerPlan } from "@/lib/types";

const PLAN_POINTS: Record<string, string[]> = {
  launch: ["Unlimited events and free tickets", "Payouts to your bank on request"],
  grow: ["A lower fee on every paid ticket", "Payouts to your bank on request"],
  scale: ["Our lowest ticket fee", "Payouts to your bank on request"],
};

function endDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
}

/** Settings → Plan: the organizer's current plan, the three plans side by
 *  side, and upgrade/cancel. Paid plans check out through Paystack and come
 *  back here with ?reference= to be confirmed. */
export function PlanSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<OrganizerPlan[]>([]);
  const [mine, setMine] = useState<MyPlan | null>(null);
  const [platformFee, setPlatformFee] = useState<TicketFee | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, m, f] = await Promise.all([getOrganizerPlans(), getMyPlan(), fetchCurrentTicketFee()]);
      setPlans(p);
      setMine(m);
      setPlatformFee(f);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load your plan.");
    }
  }, []);

  useEffect(() => {
    const reference = searchParams.get("reference");
    if (!reference) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
      load();
      return;
    }
    // Back from Paystack: confirm the payment, then drop the reference from the URL.
    setConfirming(true);
    fetch(`/api/plans/verify?reference=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) toast.success("You're on your new plan. Thank you!");
        else toast.error(json.error || "Couldn't confirm the payment.");
      })
      .catch(() => toast.error("Couldn't confirm the payment. Refresh in a moment."))
      .finally(() => {
        setConfirming(false);
        router.replace("/admin?tab=plan");
        load();
      });
  }, [searchParams, router, load]);

  async function upgrade(planId: string) {
    setBusy(planId);
    try {
      const res = await fetch("/api/plans/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      const json = await res.json();
      if (!res.ok || !json.authorizationUrl) throw new Error(json.error || "Couldn't start the payment.");
      window.location.assign(json.authorizationUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the payment.");
      setBusy(null);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel your plan? You keep it until the end of the period you've paid for, then move to Launch.")) return;
    setBusy("cancel");
    try {
      const res = await fetch("/api/plans/cancel", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't cancel the plan.");
      toast.success("Your plan won't renew.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel the plan.");
    } finally {
      setBusy(null);
    }
  }

  if (confirming || !mine || !platformFee) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {confirming ? "Confirming your payment…" : "Loading your plan…"}
      </div>
    );
  }

  const current = plans.find((p) => p.id === mine.effectivePlanId);

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-semibold text-fg">Plan</h2>
        <p className="mt-0.5 text-sm text-muted">Your plan sets the fee on every paid ticket and how many promoters you can have on each event.</p>
      </div>

      {mine.status === "past_due" && (
        <div className="eb-alert mb-4 flex items-start gap-2" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Your last renewal payment failed. Paystack will retry; update your card from the receipt email to keep {current?.name}.
        </div>
      )}
      {mine.status === "cancelling" && mine.effectivePlanId !== "launch" && (
        <p className="mb-4 text-sm text-fg-3">
          {current?.name} ends on {endDate(mine.periodEnd)}. After that you&apos;ll be on Launch.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === mine.effectivePlanId;
          const fee = formatTicketFee(planTicketFee({ fee_percentage: p.feePercentage, fee_flat_naira: p.feeFlatNaira }, platformFee));
          return (
            <section key={p.id} className="eb-plan" data-current={isCurrent || undefined} data-plan={p.id}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="eb-plan-name">
                  {p.id === "scale" && <Sparkles size={15} aria-hidden="true" />}
                  {p.name}
                </h3>
                {isCurrent && <span className="eb-plan-badge">Current plan</span>}
              </div>
              <p className="eb-plan-price">
                {p.priceMonthlyNaira > 0 ? formatNaira(p.priceMonthlyNaira) : "Free"}
                {p.priceMonthlyNaira > 0 && <span>/month</span>}
              </p>
              <p className="eb-plan-fee">{fee} per paid ticket</p>
              <ul className="eb-plan-list">
                <li>
                  <Check size={14} aria-hidden="true" /> {p.maxPromotersPerEvent == null ? "Unlimited promoters" : `Up to ${p.maxPromotersPerEvent} promoters`} per event
                </li>
                {(PLAN_POINTS[p.id] ?? []).map((t) => (
                  <li key={t}>
                    <Check size={14} aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                {isCurrent ? (
                  p.id !== "launch" && !mine.comped && mine.status !== "cancelling" ? (
                    <button type="button" onClick={cancel} disabled={busy === "cancel"} className="eb-btn eb-btn--ghost w-full">
                      {busy === "cancel" ? "Cancelling…" : "Cancel plan"}
                    </button>
                  ) : (
                    <p className="text-center text-xs text-subtle">{mine.comped ? "Set up for you by eventbuddy" : "You're on this plan"}</p>
                  )
                ) : p.id === "launch" ? (
                  <p className="text-center text-xs text-subtle">Cancel your plan to move back to Launch</p>
                ) : p.purchasable ? (
                  <button type="button" onClick={() => upgrade(p.id)} disabled={busy !== null} className="eb-btn eb-btn--primary w-full">
                    {busy === p.id ? "Opening Paystack…" : `Switch to ${p.name}`}
                  </button>
                ) : (
                  <p className="text-center text-xs text-subtle">Coming soon. Contact eventbuddy to switch.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
