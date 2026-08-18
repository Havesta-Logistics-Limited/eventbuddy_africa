import { LeadRecord } from "./types";
import { getDestinationById, getEventById, getUniversityById } from "./store";

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
      dest?.name ?? l.destinationId,
      uni?.name ?? l.universityId,
      l.preferredCourse,
      l.levelOfInterest,
      l.startYear,
      l.highestEducation,
      l.takenIELTS,
      l.comments,
      new Date(l.createdAt).toLocaleDateString("en-GB"),
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
