"use client";

import { Plus } from "lucide-react";
import { FieldDef } from "@/lib/types";
import { newId } from "@/lib/utils";
import { FieldEditorRow } from "../field-editor-row";

export function FieldBuilderStep({
  fields,
  onChange,
  alreadyCollectsAcademicFields = false,
}: {
  fields: FieldDef[];
  onChange: (fields: FieldDef[]) => void;
  /** Education Fair events already collect destination, university, preferred course,
   *  IELTS status, and more through their own dedicated fields (see the Destinations
   *  step and the staff lead-capture form) — this step is purely for anything extra on
   *  top of that, not the starting point, so the empty state shouldn't read as "from
   *  scratch." */
  alreadyCollectsAcademicFields?: boolean;
}) {
  function addField() {
    onChange([...fields, { id: newId("field"), label: "", type: "short_text", required: false }]);
  }
  function updateField(i: number, field: FieldDef) {
    onChange(fields.map((f, x) => (x === i ? field : f)));
  }
  function deleteField(i: number) {
    onChange(fields.filter((_, x) => x !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {alreadyCollectsAcademicFields ? "Anything else this event's lead form should collect?" : "What should this event's lead form collect?"}
      </label>
      <p className="text-xs text-slate-500 mb-3">
        {alreadyCollectsAcademicFields
          ? "Education Fair events already collect name, email, phone, destination, university, preferred course, and IELTS status — no setup needed for those. Only add a question here if you need something on top of that."
          : "Every event already collects name, email, and phone. Add whatever else you need here."}
      </p>
      <div className="space-y-3">
        {fields.map((f, i) => (
          <FieldEditorRow
            key={f.id}
            field={f}
            onChange={(field) => updateField(i, field)}
            onDelete={() => deleteField(i)}
            onMoveUp={i > 0 ? () => move(i, -1) : undefined}
            onMoveDown={i < fields.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
        {fields.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">
            {alreadyCollectsAcademicFields ? "No extra questions — the standard fields already cover this event." : "No questions yet — add one below."}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={addField}
        className="mt-3 flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-[#1B512D] hover:text-[#1B512D] transition-colors"
      >
        <Plus size={14} />
        Add question
      </button>
    </div>
  );
}
