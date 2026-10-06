"use client";

import { useState } from "react";
import { Download, Check, X, ArrowUpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EventRecord, LeadRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { downloadCsv, eventLeadsToCsv } from "@/lib/csv";
import { decideRegistration } from "@/lib/store";

const LEAD_STATUS_STYLES: Record<string, string> = {
  registered: "bg-amber-500/15 text-amber-300",
  pending: "bg-orange-500/15 text-orange-300",
  waitlisted: "bg-violet-500/15 text-violet-300",
  declined: "bg-rose-500/15 text-rose-300",
};
const LEAD_STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  pending: "Pending",
  waitlisted: "Waitlisted",
  declined: "Declined",
};

/** One event's leads, with columns matching exactly how that event's form was built —
 *  the Education Fair's fixed academic fields, or one column per admin-defined question
 *  for any other template. Used by the per-event page (a single event's leads) and the
 *  global Leads page (grouped into one of these per event, instead of one shared table
 *  with columns that only make sense for some rows). orgSlug is only needed to act on a
 *  pending/waitlisted lead (approve/decline/promote) — leads without either status never
 *  call the decision API, so it's optional for callers that never show that column. */
export function EventLeadsCard({ event, leads, universities, orgSlug }: { event: EventRecord; leads: LeadRecord[]; universities: University[]; orgSlug?: string }) {
  const template = getTemplate(event.templateId);
  const isEducationFair = template.id === "education-fair";
  const customFields = event.customFields ?? [];
  const showStatusColumn = leads.some((l) => l.status && l.status !== "registered");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(leadId: string, action: "approve" | "decline" | "promote") {
    if (!orgSlug || busyId) return;
    setBusyId(leadId);
    try {
      await decideRegistration(orgSlug, event.id, leadId, "lead", action);
      toast.success(action === "approve" ? "Approved" : action === "decline" ? "Declined" : "Promoted from waitlist");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update this lead.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-line-soft">
        <div>
          <h2 className="font-semibold text-fg">{event.name}</h2>
          <p className="text-xs text-muted tabular-nums">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_leads.csv`, eventLeadsToCsv(leads, event));
            toast.success("Leads exported");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line text-fg-3 hover:bg-canvas"
        >
          <Download size={12} />
          Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas">
            <tr>
              {[
                "Name",
                "Email",
                "Phone",
                ...(isEducationFair ? ["University", "Course", "Level", "Start", "IELTS"] : customFields.map((f) => f.label || "Untitled")),
                "Date",
                ...(showStatusColumn ? ["Status"] : []),
                ...(showStatusColumn && orgSlug ? ["Actions"] : []),
              ].map((h, i) => (
                <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-canvas">
                <td className="px-4 py-3 font-medium text-fg whitespace-nowrap">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-4 py-3 text-muted max-w-[180px] truncate">{lead.email}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{lead.phone}</td>
                {isEducationFair ? (
                  <>
                    <td className="px-4 py-3 text-fg-3 max-w-[160px] truncate">{universities.find((u) => u.id === lead.universityId)?.shortName}</td>
                    <td className="px-4 py-3 text-fg-3">{lead.preferredCourse}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(79, 179, 255, 0.14)", color: "#9fd3ff" }}>
                        {lead.levelOfInterest}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{lead.startYear}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          lead.takenIELTS === "Yes" ? "bg-emerald-500/15 text-emerald-300" : lead.takenIELTS === "Registered" ? "bg-amber-500/15 text-amber-300" : "bg-fill text-fg-3"
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
                      <td key={f.id} className="px-4 py-3 text-fg-3 max-w-[160px] truncate">
                        {Array.isArray(v) ? v.join(", ") : v || "—"}
                      </td>
                    );
                  })
                )}
                <td className="px-4 py-3 text-subtle whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</td>
                {showStatusColumn && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${LEAD_STATUS_STYLES[lead.status ?? "registered"]}`}>
                      {LEAD_STATUS_LABELS[lead.status ?? "registered"]}
                    </span>
                  </td>
                )}
                {showStatusColumn && orgSlug && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    {busyId === lead.id ? (
                      <Loader2 size={15} className="animate-spin text-subtle" />
                    ) : lead.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => decide(lead.id, "approve")}
                          title="Approve"
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                        >
                          <Check size={13} />
                        </button>
                        <button type="button" onClick={() => decide(lead.id, "decline")} title="Decline" className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/15">
                          <X size={13} />
                        </button>
                      </div>
                    ) : lead.status === "waitlisted" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => decide(lead.id, "promote")}
                          title="Promote from waitlist"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/15 text-xs font-medium"
                        >
                          <ArrowUpCircle size={13} /> Promote
                        </button>
                        <button type="button" onClick={() => decide(lead.id, "decline")} title="Decline" className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/15">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
