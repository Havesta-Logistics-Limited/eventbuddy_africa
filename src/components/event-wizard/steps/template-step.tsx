"use client";

import { EVENT_TEMPLATES } from "@/lib/event-templates";

export function TemplateStep({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-3">
      {EVENT_TEMPLATES.map((t) => {
        const Icon = t.icon;
        const selected = selectedId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
              selected ? "border-[#610064] bg-[#610064]/5" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${selected ? "bg-[#610064] text-white" : "bg-slate-100 text-slate-500"}`}>
              <Icon size={17} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
