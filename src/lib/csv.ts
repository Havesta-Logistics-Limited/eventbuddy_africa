import { EventRecord, LeadRecord } from "./types";
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

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
