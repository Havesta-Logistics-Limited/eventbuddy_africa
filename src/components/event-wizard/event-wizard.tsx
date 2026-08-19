"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Destination, EventRecord } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import type { EventWizardData } from "./types";
import { TemplateStep } from "./steps/template-step";
import { BasicsStep } from "./steps/basics-step";
import { DestinationsStep } from "./steps/destinations-step";
import { FieldBuilderStep } from "./steps/field-builder-step";
import { AccessStep } from "./steps/access-step";
import { ReviewStep } from "./steps/review-step";

const EMPTY_DATA: EventWizardData = {
  name: "",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  location: "",
  venue: "",
  description: "",
  destinationIds: [],
  coverImage: undefined,
  staffAccessCode: "",
  repAccessCode: "",
  templateId: "education-fair",
  customFields: [],
};

function toWizardData(event: EventRecord): EventWizardData {
  return {
    name: event.name,
    date: event.date,
    endDate: event.endDate || "",
    startTime: event.startTime || "",
    endTime: event.endTime || "",
    location: event.location,
    venue: event.venue,
    description: event.description,
    destinationIds: event.destinationIds,
    coverImage: event.coverImage,
    staffAccessCode: event.staffAccessCode || "",
    repAccessCode: event.repAccessCode || "",
    templateId: event.templateId || "education-fair",
    customFields: event.customFields || [],
    timezone: event.timezone,
  };
}

type StepId = "template" | "basics" | "customize" | "access" | "review";

export function EventWizard(props: {
  mode: "create" | "edit";
  initialEvent?: EventRecord;
  destinations: Destination[];
  onSubmit: (data: EventWizardData) => Promise<void>;
  onCancel: () => void;
}) {
  const { mode, initialEvent, destinations, onSubmit, onCancel } = props;
  const [data, setData] = useState<EventWizardData>(() =>
    initialEvent ? toWizardData(initialEvent) : { ...EMPTY_DATA, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);

  const template = getTemplate(data.templateId);
  // The template choice is immutable after creation — changing it once leads exist
  // would orphan customAnswers against a field set that no longer matches.
  const steps: StepId[] = mode === "create" ? ["template", "basics", "customize", "access", "review"] : ["basics", "customize", "access", "review"];
  const step = steps[stepIndex];

  function patch(p: Partial<EventWizardData>) {
    setData((d) => ({ ...d, ...p }));
  }

  function selectTemplate(templateId: string) {
    const t = getTemplate(templateId);
    patch({ templateId, customFields: t.defaultFields, destinationIds: t.usesDestinations ? data.destinationIds : [] });
  }

  const isBasicsValid = !!(data.name.trim() && data.date && data.venue.trim() && data.location.trim());
  const isStepValid = step === "basics" ? isBasicsValid : true;

  async function handleSubmit() {
    setSubmitError("");
    setSubmitting(true);
    try {
      await onSubmit({
        ...data,
        staffAccessCode: data.staffAccessCode?.trim() || undefined,
        repAccessCode: data.repAccessCode?.trim() || undefined,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't save this event. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  }
  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
    else onCancel();
  }

  const titles: Record<StepId, string> = {
    template: "Choose a template",
    basics: "Event details",
    customize: template.usesDestinations ? "Destinations" : "Customize your form",
    access: "Access codes",
    review: "Review & create",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">
              Step {stepIndex + 1} of {steps.length}
            </p>
            <h2 className="font-semibold text-slate-900 text-lg">{titles[step]}</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {step === "template" && <TemplateStep selectedId={data.templateId || "education-fair"} onSelect={selectTemplate} />}
          {step === "basics" && <BasicsStep data={data} onChange={patch} />}
          {step === "customize" &&
            (template.usesDestinations ? (
              <DestinationsStep destinations={destinations} selectedIds={data.destinationIds} onChange={(destinationIds) => patch({ destinationIds })} />
            ) : (
              <FieldBuilderStep fields={data.customFields || []} onChange={(customFields) => patch({ customFields })} />
            ))}
          {step === "access" && <AccessStep data={data} onChange={patch} showRepCode={template.usesDestinations} />}
          {step === "review" && <ReviewStep data={data} template={template} destinations={destinations} />}

          {submitError && step === "review" && <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{submitError}</div>}
        </div>

        <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 shrink-0">
          <button type="button" onClick={back} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {stepIndex === 0 ? "Cancel" : "Back"}
          </button>
          {step === "review" ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "#610064" }}
            >
              {submitting ? "Saving…" : mode === "create" ? "Create Event" : "Save Changes"}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!isStepValid}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "#610064" }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
