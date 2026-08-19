import { EventRecord } from "@/lib/types";

export type EventWizardData = Omit<EventRecord, "id" | "createdAt">;
