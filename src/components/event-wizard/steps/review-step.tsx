"use client";

import { Globe, Lock, Clock, Ticket } from "lucide-react";
import type { EventTemplate } from "@/lib/event-templates";
import type { EventWizardData } from "../types";

export function ReviewStep({
  data,
  template,
  onChange,
}: {
  data: EventWizardData;
  template: EventTemplate;
  /** shown when creating: the "going live" choices (migration 0128) */
  onChange?: (patch: Partial<EventWizardData>) => void;
}) {
  const isPrivate = data.visibility === "private";
  const isOpen = data.registrationOpen !== false;
  return (
    <div className="space-y-4 text-sm">
      {onChange && (
        <fieldset className="erv-live">
          <legend>Going live</legend>
          <p className="erv-q">Who can see it?</p>
          <div className="erv-opts" role="radiogroup" aria-label="Who can see it?">
            <Choice
              checked={!isPrivate}
              onSelect={() => onChange({ visibility: "public" })}
              icon={<Globe size={15} aria-hidden="true" />}
              title="Public"
              text="On Discover, your profile and search engines."
            />
            <Choice
              checked={isPrivate}
              onSelect={() => onChange({ visibility: "private" })}
              icon={<Lock size={15} aria-hidden="true" />}
              title="Private"
              text="Hidden everywhere. You get a private link to share."
            />
          </div>
          <p className="erv-q">Registration & ticket sales</p>
          <div className="erv-opts" role="radiogroup" aria-label="Registration and ticket sales">
            <Choice
              checked={isOpen}
              onSelect={() => onChange({ registrationOpen: true })}
              icon={<Ticket size={15} aria-hidden="true" />}
              title="Open now"
              text="People can register and buy as soon as it's live."
            />
            <Choice
              checked={!isOpen}
              onSelect={() => onChange({ registrationOpen: false })}
              icon={<Clock size={15} aria-hidden="true" />}
              title="Not yet"
              text={"Shows \u201cOpens soon\u201d with a notify-me box. Open it later in one click."}
            />
          </div>
        </fieldset>
      )}
      <div className="rounded-lg bg-canvas border border-line p-4 space-y-2">
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
        <Row label="Staff code" value={data.staffAccessCode || "Made for you when you save"} />
        {template.usesDestinations && data.allowRepAccess !== false && <Row label="Rep code" value={data.repAccessCode || "Made for you when you save"} />}
      </div>
      {template.usesDestinations && (
        <p className="text-xs text-subtle">Add this fair&apos;s destinations, universities, and reps from its own page once it&apos;s created.</p>
      )}
    </div>
  );
}

function Choice({ checked, onSelect, icon, title, text }: { checked: boolean; onSelect: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="erv-opt">
      <span className="erv-opt-head">
        {icon}
        {title}
      </span>
      <span className="erv-opt-text">{text}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted shrink-0">{label}</span>
      <span className="text-fg font-medium text-right">{value}</span>
    </div>
  );
}
