"use client";

import { AlertCircle, Users } from "lucide-react";
import { fieldClass, labelClass } from "@/components/dynamic-registration-form";
import type { GroupGuest } from "@/lib/group-tickets";

export const EMPTY_GUEST: GroupGuest = { firstName: "", lastName: "", email: "" };

/** The other people on a group ticket. The buyer is person 1 (the form above);
 *  each guest here gets their own ticket, QR code and email once payment clears. */
export function GroupGuestFields({
  groupSize,
  guests,
  onChange,
  error,
}: {
  groupSize: number;
  guests: GroupGuest[];
  onChange: (guests: GroupGuest[]) => void;
  error?: string;
}) {
  const count = Math.max(0, groupSize - 1);
  const rows = Array.from({ length: count }, (_, i) => guests[i] ?? EMPTY_GUEST);

  function update(i: number, patch: Partial<GroupGuest>) {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <fieldset className="space-y-4 border-t border-white/10 pt-4">
      <legend className="sr-only">Your guests</legend>
      <div>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
          <Users size={13} aria-hidden="true" /> Who&apos;s coming with you
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/50">
          This ticket admits {groupSize}. You&apos;re guest 1. Each guest below gets their own QR code by email, so you
          don&apos;t have to arrive together.
        </p>
      </div>
      {rows.map((g, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <p className="mb-2.5 text-xs font-semibold text-[#FF8AF5]">Guest {i + 2}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`guest-${i}-first`} className={labelClass}>First name *</label>
              <input id={`guest-${i}-first`} value={g.firstName} onChange={(e) => update(i, { firstName: e.target.value })} autoComplete="off" className={fieldClass} />
            </div>
            <div>
              <label htmlFor={`guest-${i}-last`} className={labelClass}>Last name *</label>
              <input id={`guest-${i}-last`} value={g.lastName} onChange={(e) => update(i, { lastName: e.target.value })} autoComplete="off" className={fieldClass} />
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor={`guest-${i}-email`} className={labelClass}>Email *</label>
            <input
              id={`guest-${i}-email`}
              type="email"
              inputMode="email"
              value={g.email}
              onChange={(e) => update(i, { email: e.target.value })}
              autoComplete="off"
              placeholder="Their ticket is sent here"
              className={fieldClass}
            />
          </div>
        </div>
      ))}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-400/10 p-3 text-sm text-rose-200">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
    </fieldset>
  );
}
