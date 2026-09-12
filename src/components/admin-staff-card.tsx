"use client";

import { Edit2, Trash2 } from "lucide-react";
import { Destination, EventRecord, StaffRecord, University } from "@/lib/types";

/** One row in the Settings → Staff "Team Members" / "Checked in without an
 *  account" lists — same card markup, just parameterized, so the two lists
 *  (split by whether the row has a real email) can't silently drift apart. */
export function StaffCard({
  staff,
  destinations,
  universities,
  events,
  onEdit,
  onDelete,
}: {
  staff: StaffRecord;
  destinations: Destination[];
  universities: University[];
  events: EventRecord[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dest = staff.destinationId ? destinations.find((d) => d.id === staff.destinationId) : null;
  const uni = staff.universityId ? universities.find((u) => u.id === staff.universityId) : null;
  const ev = staff.eventId ? events.find((e) => e.id === staff.eventId) : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#C21FAF]/30 hover:shadow-sm transition-all">
      <div className="w-10 h-10 rounded-full bg-[#C21FAF]/10 flex items-center justify-center text-[#C21FAF] font-semibold shrink-0">{staff.name.charAt(0)}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900">{staff.name}</p>
        {staff.email && <p className="text-sm text-slate-500">{staff.email}</p>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className="px-2 py-0.5 rounded-full font-medium"
          style={staff.role === "admin" ? { background: "#e8f0fe", color: "#1a3a6e" } : { background: "#f1f5f9", color: "#475569" }}
        >
          {staff.role}
        </span>
        {dest && (
          <span className="px-2 py-0.5 rounded-full bg-[#C21FAF]/10 text-[#C21FAF] hidden sm:inline-block">
            {dest.flag} {dest.name}
          </span>
        )}
        {uni && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">{uni.shortName}</span>}
        {ev && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 max-w-[120px] sm:max-w-[160px] truncate">{ev.name.split("—")[0].trim()}</span>}
      </div>
      <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-2 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-[#C21FAF] rounded-md hover:bg-slate-100">
          <Edit2 size={16} />
        </button>
        <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
