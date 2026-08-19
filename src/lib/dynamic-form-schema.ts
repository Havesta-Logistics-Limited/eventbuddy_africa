import { z } from "zod";
import { FieldDef } from "./types";

function schemaForField(f: FieldDef): z.ZodTypeAny {
  if (f.type === "checkboxes") {
    const arr = z.array(z.string());
    return f.required ? arr.min(1, "Select at least one option.") : arr.optional();
  }

  let str = z.string();
  if (f.type === "email") str = str.email("Enter a valid email address.");
  if (f.type === "number") str = str.regex(/^-?\d+(\.\d+)?$/, "Enter a number.");

  return f.required ? str.min(1, `${f.label || "This field"} is required.`) : str.optional();
}

/** Builds a zod schema for an event's admin-defined customFields, keyed by field id
 *  (matching how answers are stored in leads.custom_answers). */
export function buildCustomFieldsSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.id] = schemaForField(f);
  return z.object(shape);
}
