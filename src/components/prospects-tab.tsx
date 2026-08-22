"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, UserCheck, Download, Loader2 } from "lucide-react";
import { Destination, EventRecord, LeadRecord, RegistrationRecord, StaffRecord, University } from "@/lib/types";
import { downloadCsv, registrationsToCsv } from "@/lib/csv";
import { updateRegistrationStatus } from "@/lib/store";
import { RegistrantDetailModal } from "@/components/registrant-detail-modal";

const statusStyles: Record<RegistrationRecord["status"], string> = {
  registered: "bg-amber-100 text-amber-700",
  checked_in: "bg-teal-100 text-teal-700",
  cancelled: "bg-slate-100 text-slate-500",
};
const statusLabels: Record<RegistrationRecord["status"], string> = {
  registered: "Registered",
  checked_in: "Checked in",
  cancelled: "Cancelled",
};

/** Self-service registrants for this event, toggled between everyone who registered and
 *  just those who actually showed up — the Participants tile doubles as the attendance
 *  conversion rate (checked-in ÷ registered). The Checked In column lets an admin mark
 *  attendance by hand from here, on top of the physical /checkin scan flow at the door.
 *  Clicking a row opens the full detail modal (QR code, form answers, any lead captured
 *  for them). */
export function ProspectsTab({
  event,
  registrations,
  leads,
  destinations,
  universities,
  staff,
}: {
  event: EventRecord;
  registrations: RegistrationRecord[];
  leads: LeadRecord[];
  destinations: Destination[];
  universities: University[];
  staff: StaffRecord[];
}) {
  const [view, setView] = useState<"registrations" | "participants">("registrations");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const customFields = event.customFields ?? [];

  async function toggleCheckedIn(r: RegistrationRecord) {
    if (r.status === "cancelled" || busyId) return;
    setBusyId(r.id);
    try {
      await updateRegistrationStatus(r.id, r.status === "checked_in" ? "registered" : "checked_in");
    } catch {
      toast.error("Couldn't update check-in status. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (registrations.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
        <Users size={28} className="mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-500">No registrations yet</p>
        <p className="text-xs text-slate-400 mt-1.5">Self-service sign-ups for this event will appear here.</p>
      </div>
    );
  }

  const participants = registrations.filter((r) => r.status === "checked_in");
  const conversion = registrations.length === 0 ? 0 : Math.round((participants.length / registrations.length) * 100);
  const shown = view === "registrations" ? registrations : participants;

  const selected = selectedId ? (registrations.find((r) => r.id === selectedId) ?? null) : null;
  const selectedLead = selected ? leads.find((l) => l.registrationId === selected.id) : undefined;
  const selectedDest = selectedLead?.destinationId ? destinations.find((d) => d.id === selectedLead.destinationId) : undefined;
  const selectedUni = selectedLead?.universityId ? universities.find((u) => u.id === selectedLead.universityId) : undefined;
  const checkedInByName = selected?.checkedInBy ? staff.find((s) => s.id === selected.checkedInBy)?.name : undefined;

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <button
          type="button"
          onClick={() => setView("registrations")}
          className={`text-left p-4 rounded-2xl border shadow-sm transition-colors ${
            view === "registrations" ? "bg-brand-600/5 border-brand-600" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} className={view === "registrations" ? "text-brand-600" : "text-slate-400"} />
            <span className={`text-xs font-medium ${view === "registrations" ? "text-brand-700" : "text-slate-500"}`}>Registrations</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{registrations.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setView("participants")}
          className={`text-left p-4 rounded-2xl border shadow-sm transition-colors ${
            view === "participants" ? "bg-brand-600/5 border-brand-600" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <UserCheck size={15} className={view === "participants" ? "text-brand-600" : "text-slate-400"} />
            <span className={`text-xs font-medium ${view === "participants" ? "text-brand-700" : "text-slate-500"}`}>Participants</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {participants.length} <span className="text-sm font-normal text-slate-400">({conversion}% of registrations)</span>
          </p>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">{view === "registrations" ? "Event registrations" : "Event participants"}</h2>
            <p className="text-xs text-slate-500">
              {shown.length} {view === "registrations" ? "registrant" : "participant"}
              {shown.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => {
              downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_${view}.csv`, registrationsToCsv(shown, event));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Download size={12} />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Reference ID", "Name", "Email", "Phone", ...customFields.map((f) => f.label || "Untitled"), "Status", "Checked In", "Registered"].map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setSelectedId(r.id)} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.referenceId}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{r.fullName}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">{r.email}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.phone || "—"}</td>
                  {customFields.map((f) => {
                    const v = r.customAnswers?.[f.id];
                    return (
                      <td key={f.id} className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                        {Array.isArray(v) ? v.join(", ") : v || "—"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[r.status]}`}>{statusLabels[r.status]}</span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {busyId === r.id ? (
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={r.status === "checked_in"}
                        disabled={r.status === "cancelled"}
                        onChange={() => toggleCheckedIn(r)}
                        title={r.status === "checked_in" ? "Undo check-in" : "Mark as checked in"}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 disabled:opacity-40"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <RegistrantDetailModal
          registration={selected}
          event={event}
          lead={selectedLead}
          destination={selectedDest}
          university={selectedUni}
          checkedInByName={checkedInByName}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
