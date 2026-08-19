"use client";

import { Destination } from "@/lib/types";
import type { EventTemplate } from "@/lib/event-templates";
import type { EventWizardData } from "../types";

export function ReviewStep({ data, template, destinations }: { data: EventWizardData; template: EventTemplate; destinations: Destination[] }) {
  const eventDests = destinations.filter((d) => data.destinationIds.includes(d.id));
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
        <Row label="Template" value={template.name} />
        <Row label="Name" value={data.name || "—"} />
        <Row label="Dates" value={data.endDate ? `${data.date} – ${data.endDate}` : data.date || "—"} />
        <Row label="Venue" value={`${data.venue || "—"}, ${data.location || "—"}`} />
        {template.usesDestinations ? (
          <Row label="Destinations" value={eventDests.length ? eventDests.map((d) => `${d.flag} ${d.name}`).join(", ") : "None selected"} />
        ) : (
          <Row
            label="Form questions"
            value={data.customFields?.length ? `${data.customFields.length} question${data.customFields.length !== 1 ? "s" : ""}` : "None — just name, email, phone"}
          />
        )}
        <Row label="Staff code" value={data.staffAccessCode || "None — open check-in"} />
        {template.usesDestinations && <Row label="Rep code" value={data.repAccessCode || "None — open check-in"} />}
      </div>
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
