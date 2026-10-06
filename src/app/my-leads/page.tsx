"use client";

import { Users } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { getEventById, useLeads } from "@/lib/store";
import { Role } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { formatCustomAnswers } from "@/lib/utils";
import { Reveal } from "@/components/reveal";
import { AuthLoading } from "@/components/auth-loading";

const STAFF_ONLY: Role[] = ["staff"];

export default function MyLeadsPage() {
  const session = useRequireRole(STAFF_ONLY);
  const leads = useLeads();

  if (!session) return <AuthLoading />;

  const myLeads = leads.filter((l) => l.staffId === session.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-fg">My Leads</h1>
          <p className="text-muted text-sm mt-0.5">{myLeads.length} leads collected by you</p>
        </div>

        {myLeads.length === 0 ? (
          <div className="text-center py-16 text-subtle">
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
                <div className="bg-surface rounded-xl border border-line p-4 transition-shadow hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-fg">
                        {lead.firstName} {lead.middleName ? `${lead.middleName} ` : ""}
                        {lead.lastName}
                      </p>
                      <p className="text-sm text-muted">
                        {lead.email} · {lead.phone}
                      </p>
                    </div>
                    <p className="text-xs text-subtle whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString("en-GB")}</p>
                  </div>
                  {isEducationFair ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-sky-500/15 text-[#9fd3ff] font-medium">{lead.levelOfInterest}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-fill text-fg-3">{lead.preferredCourse}</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          lead.takenIELTS === "Yes" ? "bg-teal-500/15 text-teal-300" : lead.takenIELTS === "Registered" ? "bg-amber-500/15 text-amber-300" : "bg-fill text-muted"
                        }`}
                      >
                        IELTS: {lead.takenIELTS}
                      </span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-fill text-fg-3">Start {lead.startYear}</span>
                    </div>
                  ) : (
                    details && <p className="mt-2 text-xs text-fg-3">{details}</p>
                  )}
                  {lead.comments && <p className="mt-2 text-xs text-muted italic">&quot;{lead.comments}&quot;</p>}
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
