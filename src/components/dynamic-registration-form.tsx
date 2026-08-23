"use client";

import { z } from "zod";
import { useForm, type UseFormRegister, type FieldErrors, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldDef } from "@/lib/types";
import { buildCustomFieldsSchema } from "@/lib/dynamic-form-schema";

const baseSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().optional(),
});

type CustomAnswers = Record<string, string | string[] | undefined>;

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  custom: CustomAnswers;
}

export interface DynamicRegistrationFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  customAnswers: Record<string, string | string[]>;
}

const fieldClass =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B512D] focus:border-transparent";
const selectClass = `${fieldClass} cursor-pointer`;
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";
const errorClass = "text-rose-600 text-xs mt-1";

function DynamicField({ field, register, errors }: { field: FieldDef; register: UseFormRegister<FormValues>; errors: FieldErrors<FormValues> }) {
  const name = `custom.${field.id}` as const;
  const path = name as never;
  const error = errors.custom?.[field.id]?.message as string | undefined;
  const label = `${field.label || "Untitled question"}${field.required ? " *" : ""}`;

  return (
    <div>
      <label className={labelClass}>{label}</label>
      {field.type === "paragraph" ? (
        <textarea rows={3} {...register(path)} className={`${fieldClass} resize-none`} />
      ) : field.type === "dropdown" ? (
        <select {...register(path)} className={selectClass} defaultValue="">
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
            <label key={opt} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm cursor-pointer hover:border-slate-300">
              <input type="radio" value={opt} {...register(path)} className="accent-[#1B512D]" />
              {opt}
            </label>
          ))}
        </div>
      ) : field.type === "checkboxes" ? (
        <div className="grid grid-cols-2 gap-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm cursor-pointer hover:border-slate-300">
              <input type="checkbox" value={opt} {...register(path)} className="accent-[#1B512D]" />
              {opt}
            </label>
          ))}
        </div>
      ) : (
        <input
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "date" ? "date" : field.type === "number" ? "text" : "text"}
          {...register(path)}
          className={fieldClass}
        />
      )}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}

/** Public self-service registration form — an event's admin-defined customFields plus
 *  base contact fields, same reusable schema builder as DynamicLeadForm but styled for
 *  the public brand (purple, not staff blue) and without staff-only fields. */
export function DynamicRegistrationForm(props: {
  fields: FieldDef[];
  onSubmit: (values: DynamicRegistrationFormValues) => Promise<void>;
  submitting: boolean;
  submitError: string;
}) {
  const { fields, onSubmit, submitting, submitError } = props;
  const schema = baseSchema.extend({ custom: buildCustomFieldsSchema(fields) });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      custom: Object.fromEntries(fields.map((f) => [f.id, f.type === "checkboxes" ? [] : ""])),
    },
  });

  const submit = handleSubmit(async (values) => {
    const customAnswers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(values.custom)) {
      if (v !== undefined) customAnswers[k] = v;
    }
    await onSubmit({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone ?? "",
      customAnswers,
    });
  });

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Details</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name *</label>
            <input {...register("firstName")} className={fieldClass} placeholder="Emeka" />
            {errors.firstName && <p className={errorClass}>{errors.firstName.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input {...register("lastName")} className={fieldClass} placeholder="Adeyemi" />
            {errors.lastName && <p className={errorClass}>{errors.lastName.message}</p>}
          </div>
        </div>
        <div>
          <label className={labelClass}>Email Address *</label>
          <input type="email" {...register("email")} className={fieldClass} placeholder="emeka@example.com" />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Phone Number</label>
          <input type="tel" {...register("phone")} className={fieldClass} placeholder="+234 800 000 0000" />
        </div>
      </div>

      {fields.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Additional Questions</h2>
          {fields.map((f) => (
            <DynamicField key={f.id} field={f} register={register} errors={errors} />
          ))}
        </div>
      )}

      {submitError && <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{submitError}</div>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 rounded-xl font-semibold text-white text-base disabled:opacity-60"
        style={{ background: "#1B512D" }}
      >
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
