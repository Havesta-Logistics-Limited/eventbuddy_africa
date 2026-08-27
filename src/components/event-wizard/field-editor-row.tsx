"use client";

import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { FieldDef, FieldType } from "@/lib/types";

const TYPE_LABELS: Record<FieldType, string> = {
  short_text: "Short answer",
  paragraph: "Paragraph",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
};

const CHOICE_TYPES: FieldType[] = ["dropdown", "multiple_choice", "checkboxes"];

export function FieldEditorRow({
  field,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  field: FieldDef;
  onChange: (field: FieldDef) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const isChoice = CHOICE_TYPES.includes(field.type);

  return (
    <div className="rounded-lg border border-slate-200 p-3.5 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <input
            value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            placeholder="Question"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
          />
          <select
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as FieldType;
              const isNewChoice = CHOICE_TYPES.includes(type);
              onChange({ ...field, type, options: isNewChoice ? (field.options?.length ? field.options : ["Option 1"]) : undefined });
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp} className="text-slate-400 hover:text-slate-600 disabled:opacity-30">
            <ChevronUp size={15} />
          </button>
          <button type="button" onClick={onMoveDown} disabled={!onMoveDown} className="text-slate-400 hover:text-slate-600 disabled:opacity-30">
            <ChevronDown size={15} />
          </button>
        </div>
        <button type="button" onClick={onDelete} className="text-slate-400 hover:text-rose-600 shrink-0">
          <Trash2 size={15} />
        </button>
      </div>

      {isChoice && (
        <div className="space-y-1.5 pl-1">
          {(field.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => {
                  const options = [...(field.options ?? [])];
                  options[i] = e.target.value;
                  onChange({ ...field, options });
                }}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
              />
              <button
                type="button"
                onClick={() => onChange({ ...field, options: (field.options ?? []).filter((_, x) => x !== i) })}
                className="text-slate-400 hover:text-rose-600"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...field, options: [...(field.options ?? []), `Option ${(field.options?.length ?? 0) + 1}`] })}
            className="flex items-center gap-1.5 text-xs font-medium text-[#C21FAF] hover:underline"
          >
            <Plus size={13} />
            Add option
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} className="accent-[#C21FAF]" />
        Required
      </label>
    </div>
  );
}
