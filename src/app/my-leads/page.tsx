"use client";

import Link from "next/link";
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
      <div className="eb-staff eb-app-page p-5 sm:p-8 max-w-3xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="eb-app-title">My Leads</h1>
            <p className="eb-app-sub">Everyone you&apos;ve added from the lead form, newest first.</p>
          </div>
          <div className="eb-staff-count">
            <Users size={15} aria-hidden="true" />
            <span>
              <b>{myLeads.length}</b> {myLeads.length === 1 ? "lead" : "leads"}
            </span>
          </div>
        </div>

        {myLeads.length === 0 ? (
          <div className="eb-card items-center p-10 text-center">
            <Users size={30} className="mb-3 text-faint" aria-hidden="true" />
            <p className="font-medium text-fg-2">No leads yet</p>
            <p className="mt-1 text-sm text-muted">Everyone you add from the lead form shows up here.</p>
            <Link href="/collect" className="eb-portal-cta mt-5 max-w-xs">
              Collect a lead
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myLeads.map((lead, i) => {
              const event = getEventById(lead.eventId);
              const isEducationFair = getTemplate(event?.templateId).id === "education-fair";
              const details = formatCustomAnswers(lead.customAnswers, event?.customFields);
              return (
                <Reveal key={lead.id} index={i}>
                <div className="eb-lead-row">
                  <div className="flex items-start justify-between gap-3">
                    <span className="eb-lead-avatar" aria-hidden="true">{(lead.firstName || "?").charAt(0)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-fg">
                        {lead.firstName} {lead.middleName ? `${lead.middleName} ` : ""}
                        {lead.lastName}
                      </p>
                      <p className="truncate text-sm text-muted">
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
