"use client";

import type { EventTemplate } from "@/lib/event-templates";
import type { EventWizardData } from "../types";

export function ReviewStep({ data, template }: { data: EventWizardData; template: EventTemplate }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
        <Row label="Template" value={template.name} />
        <Row label="Name" value={data.name || "—"} />
        {data.category && <Row label="Category" value={data.category} />}
        <Row label="Dates" value={data.endDate ? `${data.date} – ${data.endDate}` : data.date || "—"} />
        {data.eventFormat === "virtual" ? (
          <>
            <Row label="Format" value="Virtual" />
            <Row label="Join link" value={data.virtualJoinUrl || "—"} />
            {data.virtualPlatform && <Row label="Platform" value={data.virtualPlatform} />}
          </>
        ) : (
          <>
            <Row label="Venue" value={`${data.venue || "—"}, ${data.location || "—"}`} />
            <Row
              label="Who can attend"
              value={data.isInviteOnly ? "Invite-only guest list" : data.selfRegistrationEnabled === false ? "Off — booth capture only" : "Anyone with the link"}
            />
          </>
        )}
        {template.usesDestinations && <Row label="Audience" value={data.allowRepAccess === false ? "Students only" : "Students & reps"} />}
        <Row
          label="Additional questions"
          value={
            data.customFields?.length
              ? `${data.customFields.length} question${data.customFields.length !== 1 ? "s" : ""}`
              : template.usesDestinations
                ? "None — standard fields only"
                : "None — just name, email, phone"
          }
        />
        <Row label="Staff code" value={data.staffAccessCode || "None — open check-in"} />
        {template.usesDestinations && data.allowRepAccess !== false && <Row label="Rep code" value={data.repAccessCode || "None — open check-in"} />}
      </div>
      {template.usesDestinations && (
        <p className="text-xs text-slate-400">Add this fair&apos;s destinations, universities, and reps from its own page once it&apos;s created.</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value}</span>
    </div>
  );
}
