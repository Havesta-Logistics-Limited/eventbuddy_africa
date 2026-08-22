"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { EventRecord, LeadRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { downloadCsv, eventLeadsToCsv } from "@/lib/csv";

/** One event's leads, with columns matching exactly how that event's form was built —
 *  the Education Fair's fixed academic fields, or one column per admin-defined question
 *  for any other template. Used by the per-event page (a single event's leads) and the
 *  global Leads page (grouped into one of these per event, instead of one shared table
 *  with columns that only make sense for some rows). */
export function EventLeadsCard({ event, leads, universities }: { event: EventRecord; leads: LeadRecord[]; universities: University[] }) {
  const template = getTemplate(event.templateId);
  const isEducationFair = template.id === "education-fair";
  const customFields = event.customFields ?? [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-900">{event.name}</h2>
          <p className="text-xs text-slate-500 tabular-nums">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_leads.csv`, eventLeadsToCsv(leads, event));
            toast.success("Leads exported");
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
              {[
                "Name",
                "Email",
                "Phone",
                ...(isEducationFair ? ["University", "Course", "Level", "Start", "IELTS"] : customFields.map((f) => f.label || "Untitled")),
                "Date",
              ].map((h, i) => (
                <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">{lead.email}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{lead.phone}</td>
                {isEducationFair ? (
                  <>
                    <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{universities.find((u) => u.id === lead.universityId)?.shortName}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.preferredCourse}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "#e8f0fe", color: "#1a3a6e" }}>
                        {lead.levelOfInterest}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{lead.startYear}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          lead.takenIELTS === "Yes" ? "bg-emerald-100 text-emerald-700" : lead.takenIELTS === "Registered" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {lead.takenIELTS}
                      </span>
                    </td>
                  </>
                ) : (
                  customFields.map((f) => {
                    const v = lead.customAnswers?.[f.id];
                    return (
                      <td key={f.id} className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                        {Array.isArray(v) ? v.join(", ") : v || "—"}
                      </td>
                    );
                  })
                )}
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
