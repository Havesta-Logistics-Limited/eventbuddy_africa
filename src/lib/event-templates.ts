import type { LucideIcon } from "lucide-react";
import { GraduationCap, Briefcase, Presentation, Store, Sparkles } from "lucide-react";
import { FieldDef } from "./types";
import { newId } from "./utils";

export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Education Fair only — everything else uses the generic custom-fields form instead. */
  usesDestinations: boolean;
  defaultFields: FieldDef[];
}

function field(label: string, type: FieldDef["type"], required: boolean, options?: string[]): FieldDef {
  return { id: newId("field"), label, type, required, options };
}

/**
 * Code-defined, not stored in the DB — adding a new event type means adding an entry
 * here, not a migration. Education Fair is registered too (with no default fields) so
 * every shared piece of code can branch on `usesDestinations` uniformly, even though its
 * lead-capture form stays hand-written in collect/page.tsx rather than rendered generically.
 */
export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "education-fair",
    name: "Education Fair",
    description: "International destinations and exhibiting universities, with the built-in academic-interest lead form.",
    icon: GraduationCap,
    usesDestinations: true,
    defaultFields: [],
  },
  {
    id: "job-fair",
    name: "Job Fair",
    description: "Career and recruitment events. Starts with a few common questions you can customize.",
    icon: Briefcase,
    usesDestinations: false,
    defaultFields: [
      field("Company / organization", "short_text", true),
      field("Position of interest", "short_text", false),
      field("Years of experience", "dropdown", false, ["0-1", "2-4", "5-9", "10+"]),
      field("LinkedIn profile", "short_text", false),
    ],
  },
  {
    id: "conference",
    name: "Conference",
    description: "Talks, workshops, and networking. Starts with a few common questions you can customize.",
    icon: Presentation,
    usesDestinations: false,
    defaultFields: [
      field("Company / organization", "short_text", true),
      field("Job title", "short_text", false),
      field("Topics you're interested in", "checkboxes", false, ["Keynotes", "Workshops", "Networking", "Product demos"]),
      field("How did you hear about this event?", "dropdown", false, ["Social media", "Email", "Referral", "Search", "Other"]),
    ],
  },
  {
    id: "trade-show",
    name: "Trade Show",
    description: "Exhibitor booths and product demos. Starts with a few common questions you can customize.",
    icon: Store,
    usesDestinations: false,
    defaultFields: [
      field("Company / organization", "short_text", true),
      field("Job title", "short_text", false),
      field("What are you interested in?", "paragraph", false),
      field("Preferred follow-up method", "multiple_choice", false, ["Email", "Phone call", "No follow-up"]),
    ],
  },
  {
    id: "custom",
    name: "Custom / Blank",
    description: "Start from scratch and build your own lead-capture form.",
    icon: Sparkles,
    usesDestinations: false,
    defaultFields: [],
  },
];

export function getTemplate(id: string | undefined): EventTemplate {
  return EVENT_TEMPLATES.find((t) => t.id === id) ?? EVENT_TEMPLATES[0];
}
