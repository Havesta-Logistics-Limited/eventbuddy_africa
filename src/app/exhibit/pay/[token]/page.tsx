"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock3, Store } from "lucide-react";
import { AuthCentered } from "@/components/auth/auth-shell";
import { formatNaira } from "@/lib/billing";

type Booking = {
  status: "applied" | "approved" | "declined" | "paid" | "cancelled";
  company: string;
  contact: string;
  amountNaira: number;
  standName: string;
  standLabel: string | null;
  organizer: string;
  event: { name: string; date: string; venue: string; location: string } | null;
};

/** An approved exhibitor pays for their stand (link from the approval email). */
export default function ExhibitPayPage() {
  const { token } = useParams<{ token: string }>();
  const reference = useSearchParams().get("reference");
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(!!reference);

  const load = useCallback(async () => {
    const res = await fetch(`/api/exhibit/pay?token=${encodeURIComponent(token)}`);
    const json = await res.json();
    if (!res.ok) setError(json.error || "This payment link isn't valid.");
    else setB(json);
  }, [token]);

  useEffect(() => {
    (async () => {
      // back from Paystack: confirm the payment before showing the booking
      if (reference) {
        const res = await fetch("/api/exhibit/pay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
        if (!res.ok) setError("We couldn't confirm that payment. If you were charged, it will be confirmed within a few minutes; refresh this page.");
        setConfirming(false);
      }
      await load();
    })();
  }, [reference, load]);

  async function pay() {
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/exhibit/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const json = await res.json();
      if (!res.ok || !json.authorizationUrl) throw new Error(json.error || "Couldn't start the payment.");
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the payment.");
      setPaying(false);
    }
  }

  if (confirming || (!b && !error)) {
    return (
      <AuthCentered>
        <p className="text-center text-sm text-muted">{confirming ? "Confirming your payment…" : "Loading…"}</p>
      </AuthCentered>
    );
  }

  if (!b) {
    return (
      <AuthCentered>
        <div className="text-center">
          <AlertCircle size={36} className="mx-auto text-rose-300" aria-hidden="true" />
          <p className="mt-3 font-semibold text-fg">{error}</p>
        </div>
      </AuthCentered>
    );
  }

  const when = b.event ? new Date(`${b.event.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <AuthCentered>
      <div className="text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[rgb(255_138_245/0.12)] text-[#ff8af5]">
          {b.status === "paid" ? <CheckCircle2 size={22} aria-hidden="true" /> : b.status === "applied" ? <Clock3 size={22} aria-hidden="true" /> : <Store size={22} aria-hidden="true" />}
        </span>
        <h1 className="eb-auth-title">
          {b.status === "paid" ? "Your stand is confirmed" : b.status === "approved" ? "Pay for your stand" : b.status === "applied" ? "Waiting for approval" : "This booking is closed"}
        </h1>
        <p className="eb-auth-sub">
          {b.company} at <strong className="text-fg">{b.event?.name}</strong>
        </p>
      </div>

      <dl className="mt-5 space-y-2 rounded-xl bg-[rgb(255_255_255/0.035)] p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Stand</dt>
          <dd className="text-right text-fg">
            {b.standName}
            {b.standLabel ? ` (${b.standLabel})` : ""}
          </dd>
        </div>
        {b.event && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">When and where</dt>
            <dd className="text-right text-fg">
              {when}
              <br />
              {[b.event.venue, b.event.location].filter(Boolean).join(", ")}
            </dd>
          </div>
        )}
        {b.amountNaira > 0 && (
          <div className="flex justify-between gap-4 border-t border-line-soft pt-2">
            <dt className="text-muted">{b.status === "paid" ? "Paid" : "To pay"}</dt>
            <dd className="font-semibold tabular-nums text-fg">{formatNaira(b.amountNaira)}</dd>
          </div>
        )}
      </dl>

      {error && (
        <p className="eb-alert mt-4" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {b.status === "approved" && (
        <button type="button" onClick={pay} disabled={paying} className="eb-btn eb-btn--primary mt-5 w-full">
          {paying ? "Opening checkout…" : `Pay ${formatNaira(b.amountNaira)}`}
        </button>
      )}
      <p className="mt-4 text-center text-xs text-subtle">
        {b.status === "paid"
          ? `A receipt is in your email. ${b.organizer} will be in touch about setup.`
          : b.status === "approved"
            ? "Card, bank transfer or USSD, through Paystack."
            : b.status === "applied"
              ? `${b.organizer || "The organizer"} hasn't decided yet. We'll email you when they do.`
              : "Contact the organizer if you think this is a mistake."}
      </p>
    </AuthCentered>
  );
}
