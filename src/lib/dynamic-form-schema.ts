import { z } from "zod";
import { FieldDef } from "./types";
import { EMAIL_REGEX, PHONE_REGEX } from "./validation";

function schemaForField(f: FieldDef): z.ZodTypeAny {
  if (f.type === "checkboxes") {
    const arr = z.array(z.string());
    return f.required ? arr.min(1, "Select at least one option.") : arr.optional();
  }

  const str = z.string();

  if (f.required) {
    let required = str.min(1, `${f.label || "This field"} is required.`);
    if (f.type === "email") required = required.email("Enter a valid email address.");
    if (f.type === "phone") required = required.regex(PHONE_REGEX, "Enter a valid phone number.");
    if (f.type === "number") required = required.regex(/^-?\d+(\.\d+)?$/, "Enter a number.");
    return required;
  }

  // Not required — an empty string means "left blank," which is fine; a
  // format check (.email()/.regex()) only makes sense once something was
  // actually typed, so this validates format via .refine() instead of the
  // same .email()/.regex() calls used above, which would otherwise reject
  // "" outright and block submitting the field empty.
  if (f.type === "email") return str.refine((v) => !v || EMAIL_REGEX.test(v), "Enter a valid email address.").optional();
  if (f.type === "phone") return str.refine((v) => !v || PHONE_REGEX.test(v), "Enter a valid phone number.").optional();
  if (f.type === "number") return str.refine((v) => !v || /^-?\d+(\.\d+)?$/.test(v), "Enter a number.").optional();
  return str.optional();
}

/** Builds a zod schema for an event's admin-defined customFields, keyed by field id
 *  (matching how answers are stored in leads.custom_answers). */
export function buildCustomFieldsSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.id] = schemaForField(f);
  return z.object(shape);
}
