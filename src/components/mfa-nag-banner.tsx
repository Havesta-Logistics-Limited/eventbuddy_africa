"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { getVerifiedFactor } from "@/lib/mfa";

/** Prompts an admin who hasn't enabled 2FA yet to go set it up — dismissible for
 *  the current session only (plain component state, nothing persisted), so it
 *  keeps resurfacing on later visits until they actually turn it on. Renders
 *  nothing once a verified factor exists or while that's still loading, so it
 *  never flashes for someone who already has 2FA on. */
export function MfaNagBanner({ onSetup }: { onSetup: () => void }) {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVerifiedFactor()
      .then((factor) => {
        if (!cancelled) setNeedsSetup(!factor);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needsSetup || dismissed) return null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 mb-5">
      <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">Secure your account with two-factor authentication</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Add a code from an authenticator app at sign-in.{" "}
          <button type="button" onClick={onSetup} className="font-medium underline hover:no-underline">
            Set it up now
          </button>
        </p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-amber-500 hover:text-amber-700 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
