"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { challengeAndVerify, getVerifiedFactor, removeFactor, startEnrollment } from "@/lib/mfa";

/** Self-service TOTP enrollment/disable — shared as-is by the org admin's Profile
 *  tab and the platform admin's Security view, since both sit on the same
 *  Supabase Auth user pool and the enroll/verify/disable flow is identical
 *  either way. */
export function TwoFactorSettings() {
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const factor = await getVerifiedFactor();
      setFactorId(factor?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetching on mount, not syncing derived state — not the pattern this rule
    // is meant to catch (see the same idiom in lib/auth.ts's useRequireRole).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function handleStart() {
    setError("");
    try {
      const enrollment = await startEnrollment();
      setEnrolling(enrollment);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start 2FA setup.");
    }
  }

  async function handleCancelEnrollment() {
    if (!enrolling) return;
    try {
      await removeFactor(enrolling.factorId);
    } catch {
      // Best-effort — an abandoned unverified factor is harmless either way.
    }
    setEnrolling(null);
    setCode("");
    setError("");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setError("");
    setVerifying(true);
    try {
      await challengeAndVerify(enrolling.factorId, code);
      setEnrolling(null);
      setCode("");
      toast.success("Two-factor authentication is on");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify that code.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisable() {
    if (!factorId) return;
    setDisabling(true);
    try {
      await removeFactor(factorId);
      setConfirmDisable(false);
      toast.success("Two-factor authentication is off");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disable 2FA.");
    } finally {
      setDisabling(false);
    }
  }

  if (loading) {
    return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
  }

  if (enrolling) {
    return (
      <div className="rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-1">Scan this with your authenticator app</h3>
        <p className="text-xs text-slate-500 mb-4">Google Authenticator, Authy, 1Password, or any other TOTP app will work.</p>
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qrCode} alt="2FA QR code" width={140} height={140} className="rounded-lg border border-slate-200 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-1">Can&apos;t scan? Enter this code manually:</p>
            <p className="font-mono text-xs bg-slate-100 rounded-lg px-3 py-2 mb-4 break-all">{enrolling.secret}</p>
            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Enter the 6-digit code</label>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full max-w-[160px] px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm max-w-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelEnrollment}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-transform active:scale-[0.97]"
                >
                  {verifying ? "Verifying…" : "Verify & enable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (factorId) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <ShieldCheck size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-emerald-900 text-sm">Two-factor authentication is on</h3>
          <p className="text-xs text-emerald-700 mt-0.5">You&apos;ll be asked for a code from your authenticator app every time you sign in.</p>
          {confirmDisable ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-emerald-800">Turn it off?</span>
              <button
                onClick={handleDisable}
                disabled={disabling}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
              >
                {disabling ? "Disabling…" : "Yes, disable"}
              </button>
              <button onClick={() => setConfirmDisable(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-white/60">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDisable(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:underline"
            >
              <ShieldOff size={13} />
              Disable
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <Smartphone size={18} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-amber-900 text-sm">Two-factor authentication is off</h3>
        <p className="text-xs text-amber-700 mt-0.5">Add a second step at sign-in with any authenticator app — we recommend turning this on.</p>
        <button
          onClick={handleStart}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-transform active:scale-[0.97]"
        >
          Set up 2FA
        </button>
      </div>
    </div>
  );
}
