"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getMySalesLimit } from "@/lib/store";

/** Tells an unverified organizer they're nearing (or at) the paid-ticket
 *  limit for unverified accounts (migration 0111). Silent otherwise. */
export function SalesLimitNotice() {
  const [limit, setLimit] = useState<{ verified: boolean; cap: number | null; sold: number } | null>(null);
  useEffect(() => {
    let live = true;
    getMySalesLimit().then((l) => live && setLimit(l));
    return () => {
      live = false;
    };
  }, []);
  if (!limit || limit.verified || limit.cap == null || limit.sold < Math.ceil(limit.cap * 0.8)) return null;
  const full = limit.sold >= limit.cap;
  return (
    <div className="eb-early-note mb-5 flex items-start gap-3 text-sm" role="status">
      <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        {full ? (
          <>
            <strong>Ticket sales are paused.</strong> New accounts can sell {limit.cap} paid tickets before eventbuddy verifies them, and you&apos;ve reached that.
          </>
        ) : (
          <>
            You&apos;ve sold <strong>{limit.sold} of {limit.cap}</strong> paid tickets new accounts can sell before eventbuddy verifies them.
          </>
        )}{" "}
        Our team is reviewing your account.{" "}
        <Link href="/contact" className="font-semibold underline underline-offset-4">
          Contact us
        </Link>{" "}
        to speed it up.
      </p>
    </div>
  );
}
