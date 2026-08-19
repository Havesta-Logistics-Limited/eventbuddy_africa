"use client";

import { Users, CalendarCheck2, CheckCircle2, GraduationCap, Globe2, BookMarked, Clock, MinusCircle, CalendarDays, ListChecks } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { useDestinations, useEvents, useLeads } from "@/lib/store";
import { EventRecord, FieldDef, Role } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";

const ADMIN_ONLY: Role[] = ["admin"];

const CHOICE_FIELD_TYPES: FieldDef["type"][] = ["dropdown", "multiple_choice", "checkboxes"];

function pct(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

export default function AnalyticsPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const leads = useLeads();
  const events = useEvents();
  const destinations = useDestinations();

  if (!session) return null;

  const eventById = new Map(events.map((ev) => [ev.id, ev]));
  const isEducationFairLead = (eventId: string) => getTemplate(eventById.get(eventId)?.templateId).id === "education-fair";

  // Academic fields (destination/course/level/IELTS) only ever hold real data for
  // Education Fair leads — scoping every breakdown below to this subset is what keeps
  // an org that's only run, say, a Job Fair from seeing a wall of misleading zeros.
  const educationFairLeads = leads.filter((l) => isEducationFairLead(l.eventId));

  const byDest = destinations
    .map((d) => ({ dest: d, count: educationFairLeads.filter((l) => l.destinationId === d.id).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const byLevel = (["BSc", "MSc", "PhD"] as const).map((level) => ({
    level,
    count: educationFairLeads.filter((l) => l.levelOfInterest === level).length,
  }));

  const byIELTS = (["Yes", "Registered", "No"] as const).map((v) => ({
    val: v,
    label: v === "Yes" ? "Ready" : v === "Registered" ? "Registered" : "Not started",
    count: educationFairLeads.filter((l) => l.takenIELTS === v).length,
    icon: v === "Yes" ? CheckCircle2 : v === "Registered" ? Clock : MinusCircle,
    textColor: v === "Yes" ? "text-teal-700" : v === "Registered" ? "text-amber-700" : "text-slate-500",
    iconColor: v === "Yes" ? "text-teal-600" : v === "Registered" ? "text-amber-500" : "text-slate-400",
    bg: v === "Yes" ? "bg-teal-50 border-teal-100" : v === "Registered" ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-150",
  }));

  const byEvent = events
    .map((ev) => ({ ev, count: leads.filter((l) => l.eventId === ev.id).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const topCourses = Object.entries(
    educationFairLeads
      .filter((l) => l.preferredCourse)
      .reduce(
        (acc, l) => {
          acc[l.preferredCourse] = (acc[l.preferredCourse] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // For every other template: a breakdown per event, per choice-type question — the
  // only shape of custom-field answer that's meaningful to chart (free-text answers
  // are listed on the leads page instead, not aggregated here).
  const customBreakdowns: { event: EventRecord; field: FieldDef; options: { label: string; count: number }[] }[] = [];
  for (const ev of events) {
    if (getTemplate(ev.templateId).id === "education-fair") continue;
    const evLeads = leads.filter((l) => l.eventId === ev.id);
    if (evLeads.length === 0) continue;
    for (const field of ev.customFields ?? []) {
      if (!CHOICE_FIELD_TYPES.includes(field.type)) continue;
      const counts = new Map<string, number>((field.options ?? []).map((opt) => [opt, 0]));
      for (const lead of evLeads) {
        const answer = lead.customAnswers?.[field.id];
        const picks = Array.isArray(answer) ? answer : answer ? [answer] : [];
        for (const pick of picks) counts.set(pick, (counts.get(pick) ?? 0) + 1);
      }
      const options = Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
      if (options.some((o) => o.count > 0)) customBreakdowns.push({ event: ev, field, options });
    }
  }

  const maxDest = Math.max(...byDest.map((x) => x.count), 1);
  const maxCourse = Math.max(...topCourses.map((x) => x[1]), 1);
  const maxEvent = Math.max(...byEvent.map((x) => x.count), 1);

  const stats = [
    { label: "Total Leads", value: leads.length, icon: Users, accent: "#610064", bg: "#f5edf6" },
    { label: "Events Run", value: events.length, icon: CalendarCheck2, accent: "#9b1fa0", bg: "#f7ecf8" },
    ...(educationFairLeads.length > 0
      ? [
          { label: "IELTS Ready", value: educationFairLeads.filter((l) => l.takenIELTS === "Yes").length, icon: CheckCircle2, accent: "#059669", bg: "#e7f6f0" },
          { label: "PhD Prospects", value: educationFairLeads.filter((l) => l.levelOfInterest === "PhD").length, icon: GraduationCap, accent: "#b45309", bg: "#fdf1e2" },
        ]
      : []),
  ];

  // Ordinal progression BSc -> MSc -> PhD: one hue, monotone lightness steps.
  const levelSteps = [
    { bg: "#f5edf6", ring: "#dcb8e0", text: "#8a0e8f" },
    { bg: "#dba8e0", ring: "#c17bc7", text: "#5c0060" },
    { bg: "#610064", ring: "#4c0050", text: "#ffffff" },
  ];

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Overview of leads across all events</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.bg }}>
                <s.icon size={18} style={{ color: s.accent }} />
              </div>
              <p className="text-3xl font-bold text-slate-900 leading-none">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1.5">{s.label}</p>
            </div>
          ))}
        </div>

        {educationFairLeads.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Globe2 size={16} className="text-[#610064]" />
                <h2 className="font-semibold text-slate-800">Leads by Destination</h2>
              </div>
              <div className="space-y-4">
                {byDest.map(({ dest, count }) => (
                  <div key={dest.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5 text-sm text-slate-600">
                        <span className="text-sm leading-none">{dest.flag}</span>
                        {dest.name}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {count} <span className="text-xs font-normal text-slate-400">({pct(count, educationFairLeads.length)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(count / maxDest) * 100}%`, background: "linear-gradient(90deg, #c17bc7, #610064)" }}
                      />
                    </div>
                  </div>
                ))}
                {byDest.length === 0 && <p className="text-slate-400 text-sm">No data yet</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap size={16} className="text-[#610064]" />
                <h2 className="font-semibold text-slate-800">Level of Interest</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {byLevel.map(({ level, count }, i) => {
                  const step = levelSteps[i];
                  return (
                    <div key={level} className="text-center p-4 rounded-xl border" style={{ background: step.bg, borderColor: step.ring }}>
                      <p className="text-3xl font-bold mb-1" style={{ color: step.text }}>
                        {count}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: step.text, opacity: 0.85 }}>
                        {level}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 mt-6 mb-4">
                <CheckCircle2 size={16} className="text-[#610064]" />
                <h2 className="font-semibold text-slate-800">IELTS Status</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
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

        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          {educationFairLeads.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <BookMarked size={16} className="text-[#610064]" />
                <h2 className="font-semibold text-slate-800">Top Courses</h2>
              </div>
              <div className="space-y-3">
                {topCourses.map(([course, count]) => (
                  <div key={course}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-slate-600 truncate mr-2">{course}</span>
                      <span className="text-sm font-semibold text-slate-900 shrink-0">
                        {count} <span className="text-xs font-normal text-slate-400">({pct(count, educationFairLeads.length)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(count / maxCourse) * 100}%`, background: "linear-gradient(90deg, #64748b, #1e293b)" }}
                      />
                    </div>
                  </div>
                ))}
                {topCourses.length === 0 && <p className="text-slate-400 text-sm">No data yet</p>}
              </div>
            </div>
          )}

          <div className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm ${educationFairLeads.length === 0 ? "lg:col-span-2" : ""}`}>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays size={16} className="text-[#610064]" />
              <h2 className="font-semibold text-slate-800">Leads by Event</h2>
            </div>
            <div className="space-y-3">
              {byEvent.map(({ ev, count }) => (
                <div key={ev.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{ev.name.split("—")[0].trim()}</p>
                      <p className="text-xs text-slate-400">
                        {ev.location} · {new Date(ev.date).getFullYear()}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-slate-900 shrink-0">{count}</span>
                  </div>
                  <div className="h-1.5 mt-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#610064]" style={{ width: `${(count / maxEvent) * 100}%` }} />
                  </div>
                </div>
              ))}
              {byEvent.length === 0 && <p className="text-slate-400 text-sm">No data yet</p>}
            </div>
          </div>
        </div>

        {customBreakdowns.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-5 mt-5">
            {customBreakdowns.map(({ event, field, options }) => {
              const total = options.reduce((sum, o) => sum + o.count, 0);
              const maxOption = Math.max(...options.map((o) => o.count), 1);
              return (
                <div key={`${event.id}-${field.id}`} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <ListChecks size={16} className="text-[#610064]" />
                    <h2 className="font-semibold text-slate-800">{field.label || "Untitled question"}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">{event.name}</p>
                  <div className="space-y-3">
                    {options.map(({ label, count }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm text-slate-600 truncate mr-2">{label}</span>
                          <span className="text-sm font-semibold text-slate-900 shrink-0">
                            {count} <span className="text-xs font-normal text-slate-400">({pct(count, total)}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(count / maxOption) * 100}%`, background: "linear-gradient(90deg, #c17bc7, #610064)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
