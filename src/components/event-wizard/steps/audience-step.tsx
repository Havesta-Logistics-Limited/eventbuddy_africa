"use client";

import { GraduationCap, Users2, Check, X } from "lucide-react";

const OPTIONS = [
  {
    value: true,
    icon: Users2,
    title: "Students & Reps",
    bullets: [
      { ok: true, text: "This event will be attended by students and university reps." },
      { ok: true, text: "Reps get their own check-in link and can see the leads collected for their school." },
    ],
  },
  {
    value: false,
    icon: GraduationCap,
    title: "Students Only",
    bullets: [
      { ok: true, text: "This event will only be attended by students." },
      { ok: false, text: "Reps won't get a check-in link or see any of this event's leads." },
    ],
  },
] as const;

export function AudienceStep({ allowRepAccess, onChange }: { allowRepAccess: boolean; onChange: (allowRepAccess: boolean) => void }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">Choose who this event is for — this controls whether reps get their own check-in link.</p>
      <div className="grid gap-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = allowRepAccess === opt.value;
          return (
            <button
              key={opt.title}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
                selected ? "border-[#610064] bg-[#610064]/5" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${selected ? "bg-[#610064] text-white" : "bg-slate-100 text-slate-500"}`}>
                <Icon size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{opt.title}</p>
                <ul className="mt-1 space-y-1">
                  {opt.bullets.map((b) => (
                    <li key={b.text} className="flex items-start gap-1.5 text-xs text-slate-500">
                      {b.ok ? <Check size={12} className="text-emerald-500 mt-0.5 shrink-0" /> : <X size={12} className="text-rose-400 mt-0.5 shrink-0" />}
                      {b.text}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
