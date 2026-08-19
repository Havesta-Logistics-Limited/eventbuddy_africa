"use client";

import { Users } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { getEventById, useLeads } from "@/lib/store";
import { Role } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { formatCustomAnswers } from "@/lib/utils";
import { Reveal } from "@/components/reveal";

const STAFF_ONLY: Role[] = ["staff"];

export default function MyLeadsPage() {
  const session = useRequireRole(STAFF_ONLY);
  const leads = useLeads();

  if (!session) return null;

  const myLeads = leads.filter((l) => l.staffId === session.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-slate-900">My Leads</h1>
          <p className="text-slate-500 text-sm mt-0.5">{myLeads.length} leads collected by you</p>
        </div>

        {myLeads.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No leads yet</p>
            <p className="text-sm mt-1">Start collecting leads from the form</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myLeads.map((lead, i) => {
              const event = getEventById(lead.eventId);
              const isEducationFair = getTemplate(event?.templateId).id === "education-fair";
              const details = formatCustomAnswers(lead.customAnswers, event?.customFields);
              return (
                <Reveal key={lead.id} index={i}>
                <div className="bg-white rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {lead.firstName} {lead.middleName ? `${lead.middleName} ` : ""}
                        {lead.lastName}
                      </p>
                      <p className="text-sm text-slate-500">
                        {lead.email} · {lead.phone}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</p>
                  </div>
                  {isEducationFair ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-[#e8f0fe] text-[#1a3a6e] font-medium">{lead.levelOfInterest}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{lead.preferredCourse}</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          lead.takenIELTS === "Yes" ? "bg-teal-100 text-teal-700" : lead.takenIELTS === "Registered" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        IELTS: {lead.takenIELTS}
                      </span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">Start {lead.startYear}</span>
                    </div>
                  ) : (
                    details && <p className="mt-2 text-xs text-slate-600">{details}</p>
                  )}
                  {lead.comments && <p className="mt-2 text-xs text-slate-500 italic">&quot;{lead.comments}&quot;</p>}
                </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
