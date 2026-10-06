"use client";

import { useState } from "react";
import Link from "next/link";
import { Rocket, X } from "lucide-react";

/** Reassures a brand-new organizer, right where they'd otherwise wonder if
 *  they need to set up payouts before doing anything: they don't, for free
 *  registrations/tickets. Shown only on a truly empty dashboard (no events
 *  yet at all) — once they've created one, they already know their way
 *  around and this would just be clutter. Dismissible for the session only
 *  (plain component state, nothing persisted), same as MfaNagBanner. */
export function FreeStartBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 mb-5">
      <Rocket size={18} className="text-sky-300 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-sky-200">No payout setup needed to get started</p>
        <p className="text-xs text-sky-300 mt-0.5">
          Create your first event and start collecting free registrations right away — add a payout bank account only when you&apos;re ready to
          sell paid tickets.{" "}
          <Link href="/admin?tab=payouts" className="font-medium underline hover:no-underline">
            Set up payouts now
          </Link>
        </p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-sky-400 hover:text-sky-300 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
