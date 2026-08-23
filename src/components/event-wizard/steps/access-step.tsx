"use client";

import { KeyRound } from "lucide-react";
import type { EventWizardData } from "../types";

const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B512D]";

export function AccessStep({
  data,
  onChange,
  showRepCode,
}: {
  data: EventWizardData;
  onChange: (patch: Partial<EventWizardData>) => void;
  showRepCode: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
        <KeyRound size={13} className="text-slate-400" />
        Access codes <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <p className="text-xs text-slate-500 mb-3">
        {showRepCode
          ? "Staff and reps must enter the matching code before they can check in for this event."
          : "Staff must enter the matching code before they can check in for this event."}
      </p>
      <div className={`grid ${showRepCode ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Staff code</label>
          <input value={data.staffAccessCode || ""} onChange={(e) => onChange({ staffAccessCode: e.target.value })} placeholder="e.g. STAFF2026" className={fieldClass} />
        </div>
        {showRepCode && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rep code</label>
            <input value={data.repAccessCode || ""} onChange={(e) => onChange({ repAccessCode: e.target.value })} placeholder="e.g. REP2026" className={fieldClass} />
          </div>
        )}
      </div>
    </div>
  );
}
