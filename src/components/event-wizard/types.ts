import { EventRecord } from "@/lib/types";

export type EventWizardData = Omit<EventRecord, "id" | "createdAt">;

/** Wizard-local only — never part of an EventRecord/EventWizardData, since it
 *  describes how many event rows to generate, not a field any one of them has.
 *  Only meaningful at creation time (see EventWizard's mode === "create" gate). */
export type RecurrenceConfig = {
  frequency: "weekly" | "biweekly" | "monthly";
  /** Total occurrences to generate, including the first — capped at 52 in the UI
   *  (a year of weekly events) purely to keep one submit from ever generating an
   *  unreasonable number of rows in one request. */
  count: number;
};
