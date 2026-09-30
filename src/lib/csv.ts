import { EventRecord, FieldDef, LeadRecord, ReferralPartner, RegistrationRecord } from "./types";
import type { ReferralTally } from "./referrals";
import { getDestinationById, getEventById, getUniversityById } from "./store";
import { formatCustomAnswers } from "./utils";
import { getTemplate } from "./event-templates";

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function leadsToCsv(leads: LeadRecord[], opts: { includeEvent?: boolean } = {}): string {
  const headers = [
    "First Name",
    "Middle Name",
    "Last Name",
    "Email",
    "Phone",
    ...(opts.includeEvent ? ["Event"] : []),
    "Destination",
    "University",
    "Preferred Course",
    "Level of Interest",
    "Start Year",
    "Highest Education",
    "Taken IELTS",
    "Comments",
    "Details",
    "Date",
  ];

  const rows = leads.map((l) => {
    const dest = getDestinationById(l.destinationId);
    const uni = getUniversityById(l.universityId);
    const event = getEventById(l.eventId);
    return [
      l.firstName,
      l.middleName ?? "",
      l.lastName,
      l.email,
      l.phone,
      ...(opts.includeEvent ? [event?.name ?? l.eventId] : []),
      dest?.name ?? l.destinationId ?? "",
      uni?.name ?? l.universityId ?? "",
      l.preferredCourse,
      l.levelOfInterest,
      l.startYear,
      l.highestEducation,
      l.takenIELTS,
      l.comments,
      formatCustomAnswers(l.customAnswers, event?.customFields),
      new Date(l.createdAt).toLocaleDateString("en-GB"),
    ];
  });

  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Single-event export with columns matching exactly how that event's form was built —
 *  the Education Fair's fixed academic fields, or one column per admin-defined question
 *  for any other template. Use this over leadsToCsv whenever every lead being exported
 *  belongs to the same event; leadsToCsv's generic column set is for exports that mix
 *  leads from multiple events/templates in one file. */
export function eventLeadsToCsv(leads: LeadRecord[], event: EventRecord): string {
  const template = getTemplate(event.templateId);
  if (template.id === "education-fair") return leadsToCsv(leads);

  const fields = event.customFields ?? [];
  const headers = ["First Name", "Middle Name", "Last Name", "Email", "Phone", ...fields.map((f) => f.label || "Untitled"), "Comments", "Date"];

  const rows = leads.map((l) => [
    l.firstName,
    l.middleName ?? "",
    l.lastName,
    l.email,
    l.phone,
    ...fields.map((f) => {
      const v = l.customAnswers?.[f.id];
      return Array.isArray(v) ? v.join(", ") : (v ?? "");
    }),
    l.comments,
    new Date(l.createdAt).toLocaleDateString("en-GB"),
  ]);

  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Self-service registrations for one event — columns matching how that event's
 *  registration form was built, same convention as eventLeadsToCsv. */
export function registrationsToCsv(registrations: RegistrationRecord[], event: EventRecord): string {
  const fields = event.customFields ?? [];
  const headers = ["Reference ID", "Name", "Email", "Phone", ...fields.map((f) => f.label || "Untitled"), "Status", "Checked In", "Registered"];

  const rows = registrations.map((r) => [
    r.referenceId,
    r.fullName,
    r.email,
    r.phone ?? "",
    ...fields.map((f) => {
      const v = r.customAnswers?.[f.id];
      return Array.isArray(v) ? v.join(", ") : (v ?? "");
    }),
    r.status,
    r.checkedInAt ? new Date(r.checkedInAt).toLocaleString("en-GB") : "",
    new Date(r.createdAt).toLocaleDateString("en-GB"),
  ]);

  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Post-event survey responses — same column-per-question convention as
 *  eventLeadsToCsv/registrationsToCsv, one row per attendee response. */
export function surveyResponsesToCsv(responses: { answers: Record<string, string | string[]>; createdAt: string }[], fields: FieldDef[]): string {
  const headers = ["Submitted", ...fields.map((f) => f.label || "Untitled")];
  const rows = responses.map((r) => [
    new Date(r.createdAt).toLocaleString("en-GB"),
    ...fields.map((f) => {
      const v = r.answers[f.id];
      return Array.isArray(v) ? v.join(", ") : (v ?? "");
    }),
  ]);
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Referral partners with what each brought in and what they are owed — the
 *  sheet an organizer settles against after the event. Money columns are raw
 *  numbers, not formatted naira, so the file can be summed in a spreadsheet. */
export function referralsToCsv(
  partners: ReferralPartner[],
  tallies: Record<string, ReferralTally>,
  commissionLabels: Record<string, string>
): string {
  const headers = [
    "Partner", "Code", "Email", "Phone", "Commission basis", "Rate",
    "Clicks", "Signups", "Paid tickets", "Gross NGN", "Net NGN", "Commission NGN", "Status",
  ];
  const rows = partners.map((p) => {
    const t = tallies[p.id];
    return [
      p.partnerName,
      p.code,
      p.partnerEmail ?? "",
      p.partnerPhone ?? "",
      commissionLabels[p.commissionType] ?? p.commissionType,
      p.commissionType === "none" ? "" : p.commissionRate,
      p.clickCount,
      t?.registrations ?? 0,
      t?.paidTickets ?? 0,
      (t?.grossNaira ?? 0).toFixed(2),
      (t?.netNaira ?? 0).toFixed(2),
      (t?.commissionNaira ?? 0).toFixed(2),
      p.isActive ? "Active" : "Inactive",
    ];
  });
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
