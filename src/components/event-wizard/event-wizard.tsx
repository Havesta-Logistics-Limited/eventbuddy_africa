"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Destination, EventRecord } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import type { EventWizardData } from "./types";
import { TemplateStep } from "./steps/template-step";
import { AudienceStep } from "./steps/audience-step";
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
  allowRepAccess: true,
  selfRegistrationEnabled: true,
  eventFormat: "physical",
  virtualJoinUrl: "",
  virtualPlatform: "",
  virtualAccessNotes: "",
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
    allowRepAccess: event.allowRepAccess ?? true,
    selfRegistrationEnabled: event.selfRegistrationEnabled ?? true,
    timezone: event.timezone,
    eventFormat: event.eventFormat || "physical",
    virtualJoinUrl: event.virtualJoinUrl || "",
    virtualPlatform: event.virtualPlatform || "",
    virtualAccessNotes: event.virtualAccessNotes || "",
  };
}

type StepId = "template" | "basics" | "audience" | "destinations" | "fields" | "access" | "review";

export function EventWizard(props: {
  mode: "create" | "edit";
  initialEvent?: EventRecord;
  destinations: Destination[];
  onSubmit: (data: EventWizardData, intent: "draft" | "publish") => Promise<void>;
  onCancel: () => void;
}) {
  const { mode, initialEvent, destinations, onSubmit, onCancel } = props;
  const [data, setData] = useState<EventWizardData>(() =>
    initialEvent ? toWizardData(initialEvent) : { ...EMPTY_DATA, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  );
  const [submitting, setSubmitting] = useState<"draft" | "publish" | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);

  const template = getTemplate(data.templateId);
  // The template choice is immutable after creation — changing it once leads exist
  // would orphan customAnswers against a field set that no longer matches. Audience
  // comes right after picking the template (or first, when editing) since it shapes
  // what the rest of the wizard even needs to ask. Destinations and additional
  // questions are independent steps — a template using destinations (Education Fair)
  // can still define its own extra questions on top of them, same as any other template.
  const audienceSteps: StepId[] = template.usesDestinations ? ["audience"] : [];
  const destFieldSteps: StepId[] = template.usesDestinations ? ["destinations", "fields"] : ["fields"];
  const steps: StepId[] =
    mode === "create"
      ? ["template", ...audienceSteps, "basics", ...destFieldSteps, "access", "review"]
      : ["basics", ...audienceSteps, ...destFieldSteps, "access", "review"];
  const step = steps[stepIndex];

  function patch(p: Partial<EventWizardData>) {
    setData((d) => ({ ...d, ...p }));
  }

  function selectTemplate(templateId: string) {
    const t = getTemplate(templateId);
    patch({ templateId, customFields: t.defaultFields, destinationIds: t.usesDestinations ? data.destinationIds : [] });
  }

  const isBasicsValid = !!(
    data.name.trim() &&
    data.date &&
    (data.eventFormat === "virtual" ? data.virtualJoinUrl?.trim() : data.venue.trim() && data.location.trim())
  );
  const isStepValid = step === "basics" ? isBasicsValid : true;

  // Physical events cost money to publish — an admin should be able to save one as a
  // draft (no payment) and come back to it, rather than being forced to pay the moment
  // they finish the wizard. This only applies while the event is actually unpaid: a
  // brand-new physical event (create mode) or an existing draft awaiting payment (edit
  // mode, initialEvent.published === false). Virtual events and already-paid physical
  // events have nothing to publish, so they keep a single save button.
  const needsPayment = data.eventFormat === "physical" && (mode === "create" || initialEvent?.published === false);

  async function handleSubmit(intent: "draft" | "publish") {
    setSubmitError("");
    setSubmitting(intent);
    try {
      await onSubmit(
        {
          ...data,
          staffAccessCode: data.staffAccessCode?.trim() || undefined,
          repAccessCode: data.repAccessCode?.trim() || undefined,
        },
        intent
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't save this event. Please try again.");
    } finally {
      setSubmitting(null);
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
    audience: "Who is this event for?",
    destinations: "Destinations",
    fields: "Additional questions",
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
          {step === "audience" && (
            <AudienceStep allowRepAccess={data.allowRepAccess ?? true} onChange={(allowRepAccess) => patch({ allowRepAccess })} />
          )}
          {step === "destinations" && (
            <DestinationsStep destinations={destinations} selectedIds={data.destinationIds} onChange={(destinationIds) => patch({ destinationIds })} />
          )}
          {step === "fields" && (
            <FieldBuilderStep
              fields={data.customFields || []}
              onChange={(customFields) => patch({ customFields })}
              alreadyCollectsAcademicFields={template.usesDestinations}
            />
          )}
          {step === "access" && <AccessStep data={data} onChange={patch} showRepCode={template.usesDestinations && data.allowRepAccess !== false} />}
          {step === "review" && <ReviewStep data={data} template={template} destinations={destinations} />}

          {submitError && step === "review" && <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{submitError}</div>}
        </div>

        <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 shrink-0">
          <button type="button" onClick={back} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {stepIndex === 0 ? "Cancel" : "Back"}
          </button>
          {step === "review" ? (
            needsPayment ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit("draft")}
                  disabled={submitting !== null}
                  className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {submitting === "draft" ? "Saving…" : "Save Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit("publish")}
                  disabled={submitting !== null}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: "#610064" }}
                >
                  {submitting === "publish" ? "Redirecting…" : "Publish"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(mode === "create" ? "publish" : "draft")}
                disabled={submitting !== null}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ background: "#610064" }}
              >
                {submitting !== null ? "Saving…" : mode === "create" ? "Create Event" : "Save Changes"}
              </button>
            )
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
