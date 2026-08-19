"use client";

import { Download } from "lucide-react";
import { EventRecord, RegistrationRecord } from "@/lib/types";
import { downloadCsv, registrationsToCsv } from "@/lib/csv";

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

/** Self-service attendee registrations for one event — a twin of EventLeadsCard's card
 *  chrome/export pattern, for the separate registrations table (see 0013_attendee_registrations.sql). */
export function RegistrationsCard({ event, registrations }: { event: EventRecord; registrations: RegistrationRecord[] }) {
  const customFields = event.customFields ?? [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-900">Registrations</h2>
          <p className="text-xs text-slate-500">
            {registrations.length} registrant{registrations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_registrations.csv`, registrationsToCsv(registrations, event))}
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
              {["Reference ID", "Name", "Email", "Phone", ...customFields.map((f) => f.label || "Untitled"), "Status", "Registered"].map((h, i) => (
                <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {registrations.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
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
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
