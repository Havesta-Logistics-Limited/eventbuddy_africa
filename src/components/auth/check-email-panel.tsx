"use client";

import { useState } from "react";
import { AlertCircle, MailCheck } from "lucide-react";

/** The "check your email" step after sign-up (organizers and promoters).
 *  Says so honestly when the first email failed to send, and lets the person
 *  ask for another one either way. */
export function CheckEmailPanel({ email, emailSent, onBack }: { email: string; emailSent: boolean; onBack: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function resend() {
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send the email. Try again in a minute.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the email. Try again in a minute.");
      setState("idle");
    }
  }

  const failed = !emailSent && state !== "sent";
  return (
    <div className="text-center">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 ${failed ? "bg-amber-500/15" : "bg-brand-500/15"}`}>
        {failed ? <AlertCircle size={24} className="text-amber-300" /> : <MailCheck size={24} className="text-brand-500" />}
      </div>
      <h1 className="eb-auth-title mb-2">{failed ? "Your account is ready" : "Check your email"}</h1>
      <p className="text-muted text-sm mb-6">
        {failed ? (
          <>
            We couldn&apos;t send the verification email to <span className="font-medium text-fg-2">{email}</span>. Tap below to send it
            again. You&apos;ll need it to sign in.
          </>
        ) : (
          <>
            We&apos;ve sent a verification link to <span className="font-medium text-fg-2">{email}</span>. Verify your email to activate your
            account. You won&apos;t be able to sign in until it&apos;s confirmed.
          </>
        )}
      </p>
      {state === "sent" && <p className="mb-4 text-sm text-emerald-300">A new link is on its way. Check your inbox and spam folder.</p>}
      {error && (
        <p className="eb-alert mb-4 text-left" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      <button type="button" onClick={resend} disabled={state === "sending"} className={`eb-btn w-full ${failed ? "eb-btn--primary" : "eb-btn--ghost"}`}>
        {state === "sending" ? "Sending…" : failed ? "Send the email again" : "Didn't get it? Resend email"}
      </button>
      <button type="button" onClick={onBack} className="eb-link mt-5 text-sm">
        Back to sign in
      </button>
    </div>
  );
}
