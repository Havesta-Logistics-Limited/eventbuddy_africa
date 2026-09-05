"use client";

import type { ReactNode } from "react";
import { CheckCircle2, GraduationCap, Globe2, BookMarked, Clock, MinusCircle, ListChecks, Ticket, Users, UserCheck, Award, ClipboardList, Building2 } from "lucide-react";
import { Destination, EventRecord, FieldDef, LeadRecord, RegistrationRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { Reveal } from "@/components/reveal";

const CHOICE_FIELD_TYPES: FieldDef["type"][] = ["dropdown", "multiple_choice", "checkboxes"];

function pct(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

const NO_DATA_COLOR = "#cbd5e1";
const NO_DATA_COLOR_VERTICAL = "#cbd5e1";

const REGISTRATION_STATUS_COLORS: Record<RegistrationRecord["status"], string> = {
  registered: "#E85D0A",
  checked_in: "#0d7c6e",
  cancelled: "#94a3b8",
  pending: "#D97706",
  waitlisted: "#7c3aed",
  declined: "#dc2626",
};
const REGISTRATION_STATUS_LABELS: Record<RegistrationRecord["status"], string> = {
  registered: "Registered",
  checked_in: "Checked In",
  cancelled: "Cancelled",
  pending: "Pending",
  waitlisted: "Waitlisted",
  declined: "Declined",
};

/** A short vertical bar comparison — used for Registrations vs Participants and for
 *  Highest Education, mirroring the reference dashboard's mix of vertical and
 *  horizontal bar charts. */
function VerticalBars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex items-end gap-8 h-36 px-2">
      {items.map((item, i) => {
        const isEmpty = item.value === 0;
        return (
          <Reveal key={item.label} index={i}>
            <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end min-w-[64px]">
              <span className={`text-sm font-semibold ${isEmpty ? "text-slate-400" : "text-slate-900"}`}>{item.value}</span>
              <div
                className={`w-full max-w-[72px] rounded-t-lg transition-all duration-500 ${isEmpty ? "bg-slate-100 border border-dashed border-slate-200" : ""}`}
                style={isEmpty ? { height: "10px" } : { height: `${Math.max((item.value / max) * 112, 6)}px`, background: item.color }}
              />
              <span className="text-xs text-slate-500 text-center">{item.label}</span>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

/** A horizontal bar list — the workhorse chart shape reused across every breakdown
 *  below (destination, university, course, custom field, ...). */
function BarList({
  rows,
  total,
  color,
}: {
  rows: { key: string; label: ReactNode; count: number; color?: string }[];
  total: number;
  color: string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-4">
      {rows.map((r, i) => (
        <Reveal key={r.key} index={i}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm text-slate-600 truncate mr-2">{r.label}</span>
            <span className="text-sm font-semibold text-slate-900 shrink-0">
              {r.count} <span className="text-xs font-normal text-slate-400">({pct(r.count, total)}%)</span>
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(r.count / max) * 100}%`, background: r.color ?? color }} />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/** This event's own breakdown — moved here from the old cross-event /analytics page so
 *  each event's numbers live where you're already looking at that event, instead of a
 *  separate page you have to cross-reference against the event list. */
export function EventAnalytics({
  event,
  leads,
  registrations,
  destinations,
  universities,
}: {
  event: EventRecord;
  leads: LeadRecord[];
  registrations: RegistrationRecord[];
  destinations: Destination[];
  universities: University[];
}) {
  const isEducationFair = getTemplate(event.templateId).id === "education-fair";
  const eventDests = destinations.filter((d) => event.destinationIds.includes(d.id));
  const eventUnis = universities.filter((u) => event.destinationIds.includes(u.destinationId));

  if (leads.length === 0 && registrations.length === 0) return null;

  const participants = registrations.filter((r) => r.status === "checked_in");
  const conversion = pct(participants.length, registrations.length);

  const registrationStatusRows = (["registered", "checked_in", "cancelled"] as const)
    .map((s) => ({ key: s, count: registrations.filter((r) => r.status === s).length, label: REGISTRATION_STATUS_LABELS[s], color: REGISTRATION_STATUS_COLORS[s] }))
    .filter((r) => r.count > 0);

  const byDestAll = eventDests.map((d) => ({ dest: d, count: leads.filter((l) => l.destinationId === d.id).length }));
  const byDest = byDestAll.filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
  const destMissing = leads.length - byDestAll.reduce((sum, x) => sum + x.count, 0);

  const byUniversity = eventUnis
    .map((u) => ({ uni: u, count: leads.filter((l) => l.universityId === u.id).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byLevelAll = (["BSc", "MSc", "PhD"] as const).map((level) => ({ level, count: leads.filter((l) => l.levelOfInterest === level).length }));
  const byLevel = byLevelAll.filter((x) => x.count > 0);
  const levelMissing = leads.length - byLevelAll.reduce((sum, x) => sum + x.count, 0);

  const byEducationAll = (["Undergraduate", "BSc", "MSc", "PhD"] as const).map((level) => ({
    label: level as string,
    value: leads.filter((l) => l.highestEducation === level).length,
    color: "#C21FAF",
  }));
  const byEducation = byEducationAll.filter((x) => x.value > 0);
  const educationMissing = leads.length - byEducationAll.reduce((sum, x) => sum + x.value, 0);

  const byIELTS = (["Yes", "Registered", "No"] as const).map((v) => ({
    val: v as string,
    label: v === "Yes" ? "Ready" : v === "Registered" ? "Registered" : "Not started",
    count: leads.filter((l) => l.takenIELTS === v).length,
    icon: v === "Yes" ? CheckCircle2 : v === "Registered" ? Clock : MinusCircle,
    textColor: v === "Yes" ? "text-teal-700" : v === "Registered" ? "text-amber-700" : "text-slate-500",
    iconColor: v === "Yes" ? "text-teal-600" : v === "Registered" ? "text-amber-500" : "text-slate-400",
    bg: v === "Yes" ? "bg-teal-50 border-teal-100" : v === "Registered" ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-150",
  }));
  const ieltsMissing = leads.filter((l) => !l.takenIELTS).length;
  if (ieltsMissing > 0) {
    byIELTS.push({
      val: "none",
      label: "No Data",
      count: ieltsMissing,
      icon: MinusCircle,
      textColor: "text-slate-400",
      iconColor: "text-slate-300",
      bg: "bg-slate-50 border-slate-150",
    });
  }

  const topCoursesAll = Object.entries(
    leads
      .filter((l) => l.preferredCourse)
      .reduce(
        (acc, l) => {
          acc[l.preferredCourse] = (acc[l.preferredCourse] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
  ).sort((a, b) => b[1] - a[1]);
  const topCourses = topCoursesAll.slice(0, 8);
  const courseMissing = leads.filter((l) => !l.preferredCourse).length;

  // Only meaningful for non-Education-Fair templates, whose leads carry customAnswers
  // instead of the fixed academic fields above.
  const customBreakdowns: { field: FieldDef; options: { label: string; count: number }[] }[] = [];
  if (!isEducationFair) {
    for (const field of event.customFields ?? []) {
      if (!CHOICE_FIELD_TYPES.includes(field.type)) continue;
      const counts = new Map<string, number>((field.options ?? []).map((opt) => [opt, 0]));
      for (const lead of leads) {
        const answer = lead.customAnswers?.[field.id];
        const picks = Array.isArray(answer) ? answer : answer ? [answer] : [];
        for (const pick of picks) counts.set(pick, (counts.get(pick) ?? 0) + 1);
      }
      const options = Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
      if (options.some((o) => o.count > 0)) customBreakdowns.push({ field, options });
    }
  }

  const stats = [
    { label: "Total Leads", value: leads.length, icon: Users, accent: "#C21FAF", bg: "#FFF3FD" },
    { label: "Registrations", value: registrations.length, icon: Ticket, accent: "#ED1CDC", bg: "#FDECFB" },
    ...(registrations.length > 0 ? [{ label: "Participants", value: participants.length, icon: UserCheck, accent: "#0d9488", bg: "#e7f6f0" }] : []),
    ...(isEducationFair
      ? [
          { label: "IELTS Ready", value: leads.filter((l) => l.takenIELTS === "Yes").length, icon: CheckCircle2, accent: "#059669", bg: "#e7f6f0" },
          { label: "PhD Prospects", value: leads.filter((l) => l.levelOfInterest === "PhD").length, icon: GraduationCap, accent: "#b45309", bg: "#fdf1e2" },
        ]
      : []),
  ];

  const statsLgCols = stats.length >= 5 ? "lg:grid-cols-5" : stats.length === 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <div className="mb-6">
      <h2 className="font-display text-lg text-slate-900 mb-4">Analytics</h2>

      <div className={`grid grid-cols-2 ${statsLgCols} gap-4 mb-5`}>
        {stats.map((s, i) => (
          <Reveal key={s.label} index={i}>
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-md active:translate-y-0 active:scale-[0.98]">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.bg }}>
                <s.icon size={18} style={{ color: s.accent }} />
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1.5">{s.label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {registrations.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Ticket size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-800">Registrations &amp; Participants</h3>
            </div>
            <VerticalBars
              items={[
                { label: "Registrations", value: registrations.length, color: "#6D28D9" },
                { label: `Participants (${conversion}%)`, value: participants.length, color: "#0d7c6e" },
              ]}
            />
          </div>

          {registrationStatusRows.length > 0 && (
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList size={16} className="text-brand-600" />
                <h3 className="font-semibold text-slate-800">Registration Status</h3>
              </div>
              <BarList
                rows={registrationStatusRows.map((r) => ({ key: r.key, label: r.label, count: r.count, color: r.color }))}
                total={registrations.length}
                color="#6D28D9"
              />
            </div>
          )}
        </div>
      )}

      {isEducationFair && leads.length === 0 && (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-dashed border-slate-300 p-8 text-center mb-5">
          <Users size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No leads captured for this event yet</p>
          <p className="text-xs text-slate-400 mt-1">Destination, study level, and qualification breakdowns will appear here once staff start capturing leads.</p>
        </div>
      )}

      {isEducationFair && leads.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Globe2 size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-800">Leads by Destination</h3>
            </div>
            <BarList
              rows={[
                ...byDest.map(({ dest, count }) => ({
                  key: dest.id,
                  count,
                  label: (
                    <>
                      <span className="text-sm leading-none">{dest.flag}</span>
                      {dest.name}
                    </>
                  ),
                })),
                ...(destMissing > 0 ? [{ key: "no-data", count: destMissing, label: "No Data", color: NO_DATA_COLOR }] : []),
              ]}
              total={leads.length}
              color="#6D28D9"
            />
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-800">Preferred Study Level</h3>
            </div>
            <BarList
              rows={[
                ...byLevel.map(({ level, count }) => ({ key: level, count, label: level })),
                ...(levelMissing > 0 ? [{ key: "no-data", count: levelMissing, label: "No Data", color: NO_DATA_COLOR }] : []),
              ]}
              total={leads.length}
              color="#E85D0A"
            />

            <div className="flex items-center gap-2 mb-4 mt-6">
              <CheckCircle2 size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-800">IELTS Status</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {byIELTS.map(({ val, label, count, icon: Icon, bg, textColor, iconColor }) => (
                <div key={val} className={`text-center p-3 rounded-xl border ${bg}`}>
                  <Icon size={16} className={`mx-auto mb-1.5 ${iconColor}`} />
                  <p className={`text-2xl font-bold ${textColor}`}>{count}</p>
                  <p className={`text-[11px] font-medium ${textColor} mt-0.5`}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isEducationFair && leads.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Award size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-800">Highest Qualification</h3>
            </div>
            <VerticalBars items={[...byEducation, ...(educationMissing > 0 ? [{ label: "No Data", value: educationMissing, color: NO_DATA_COLOR_VERTICAL }] : [])]} />
          </div>

          <div className={`bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm ${byUniversity.length === 0 ? "flex flex-col items-center justify-center text-center" : ""}`}>
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-800">Leads by University</h3>
            </div>
            {byUniversity.length > 0 ? (
              <BarList rows={byUniversity.map(({ uni, count }) => ({ key: uni.id, count, label: uni.name }))} total={leads.length} color="#170821" />
            ) : (
              <p className="text-sm text-slate-400 py-6">No leads have a university recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {isEducationFair && leads.length > 0 && (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm mb-5">
          <div className="flex items-center gap-2 mb-4">
            <BookMarked size={16} className="text-brand-600" />
            <h3 className="font-semibold text-slate-800">Top Courses</h3>
          </div>
          <BarList
            rows={[
              ...topCourses.map(([course, count]) => ({ key: course, count, label: course })),
              ...(courseMissing > 0 ? [{ key: "no-data", count: courseMissing, label: "No Data", color: NO_DATA_COLOR }] : []),
            ]}
            total={leads.length}
            color="#6D28D9"
          />
        </div>
      )}

      {customBreakdowns.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5">
          {customBreakdowns.map(({ field, options }, i) => {
            const total = options.reduce((sum, o) => sum + o.count, 0);
            return (
              <Reveal key={field.id} index={i}>
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <ListChecks size={16} className="text-brand-600" />
                    <h3 className="font-semibold text-slate-800">{field.label || "Untitled question"}</h3>
                  </div>
                  <BarList
                    rows={options.map((o) => ({ key: o.label, count: o.count, label: o.label }))}
                    total={total}
                    color="#C21FAF"
                  />
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
