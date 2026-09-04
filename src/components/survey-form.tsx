"use client";

import { useState } from "react";
import { FieldDef } from "@/lib/types";

const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

export type SurveyAnswers = Record<string, string | string[]>;

function SurveyField({ field, value, onChange }: { field: FieldDef; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const label = `${field.label || "Untitled question"}${field.required ? " *" : ""}`;

  return (
    <div>
      <label className={labelClass}>{label}</label>
      {field.type === "paragraph" ? (
        <textarea rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} resize-none`} />
      ) : field.type === "dropdown" ? (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} cursor-pointer`}>
          <option value="">Select an option</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "multiple_choice" ? (
        <div className="grid grid-cols-2 gap-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 cursor-pointer hover:border-slate-300">
              <input type="radio" checked={value === opt} onChange={() => onChange(opt)} className="accent-brand-600" />
              {opt}
            </label>
          ))}
        </div>
      ) : field.type === "checkboxes" ? (
        <div className="grid grid-cols-2 gap-2">
          {(field.options ?? []).map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            return (
              <label key={opt} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={arr.includes(opt)}
                  onChange={(e) => onChange(e.target.checked ? [...arr, opt] : arr.filter((o) => o !== opt))}
                  className="accent-brand-600"
                />
                {opt}
              </label>
            );
          })}
        </div>
      ) : (
        <input
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "date" ? "date" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        />
      )}
    </div>
  );
}

/** A plain, self-contained form for an admin-defined FieldDef[] — deliberately not
 *  react-hook-form/zod like DynamicRegistrationForm: a survey response has nothing
 *  else riding on it (no ticket, no capacity, no payment), so plain controlled
 *  state is simpler and this component owns no identity fields at all — the
 *  submitter's identity comes from the Hub's own hub_token, already established
 *  before this ever renders. */
export function SurveyForm({ fields, onSubmit, submitting, submitError }: { fields: FieldDef[]; onSubmit: (answers: SurveyAnswers) => void; submitting: boolean; submitError: string }) {
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [validationError, setValidationError] = useState("");

  function set(fieldId: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of fields) {
      if (!f.required) continue;
      const v = answers[f.id];
      if (!v || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && !v.trim())) {
        setValidationError(`"${f.label || "Untitled question"}" is required.`);
        return;
      }
    }
    setValidationError("");
    onSubmit(answers);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <SurveyField key={f.id} field={f} value={answers[f.id]} onChange={(v) => set(f.id, v)} />
      ))}
      {(validationError || submitError) && <p className="text-sm text-rose-600">{validationError || submitError}</p>}
      <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
