"use client";

import { Destination, StaffRecord, University } from "@/lib/types";
import { CheckinLinksCard } from "@/components/checkin-links-card";

/** Read-only roster of everyone who has signed in for this event via the staff or rep
 *  check-in link — full add/edit/remove for these people lives in Settings, this is
 *  just "who has actually shown up to work this event." */
export function StaffRosterTab({
  role,
  staff,
  destinations,
  universities,
  orgSlug,
  eventId,
  eventSlug,
}: {
  role: "staff" | "rep";
  staff: StaffRecord[];
  destinations: Destination[];
  universities: University[];
  orgSlug?: string;
  eventId: string;
  eventSlug?: string;
}) {
  return (
    <div>
      {orgSlug && <CheckinLinksCard orgSlug={orgSlug} eventId={eventId} eventSlug={eventSlug} showStaffLink={role === "staff"} showRepLink={role === "rep"} />}

      {staff.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
          <p className="font-medium text-slate-500">
            {role === "staff" ? "No check-in staff have signed in for this event yet" : "No representatives have signed in for this event yet"}
          </p>
          <p className="text-xs text-slate-400 mt-1.5">
            Anyone who signs in with the {role === "staff" ? "staff" : "rep"} check-in link above will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => {
            const dest = s.destinationId ? destinations.find((d) => d.id === s.destinationId) : null;
            const uni = s.universityId ? universities.find((u) => u.id === s.universityId) : null;
            return (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 font-semibold shrink-0">{s.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 flex items-center gap-2">
                    {s.name}
                    {s.isOnline && (
                      <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Online
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">{s.email}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs shrink-0">
                  {dest && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-600/10 text-brand-700 hidden sm:inline-block">
                      {dest.flag} {dest.name}
                    </span>
                  )}
                  {uni && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">{uni.shortName}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
