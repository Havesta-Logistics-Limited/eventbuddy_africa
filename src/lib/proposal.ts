/**
 * Client proposals (platform portal → Quotes & Invoices, migration 0125): the
 * sections of a proposal and the starting text a new one gets. Everything is
 * editable per proposal; the defaults follow eventbuddy's standard event
 * technology and on-site operations proposal, worded for any kind of event.
 */

export type ProposalScopeItem = { title: string; text: string };
export type ProposalFee = { item: string; detail: string; amountNaira: number };
export type ProposalPlanRow = { stage: string; activity: string; input: string };
export type ProposalConfirmRow = { item: string; status: string };

export type ProposalContent = {
  title: string;
  eventName: string;
  preparedFor: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  attendance: string;
  /** a downscaled JPEG data URL of the event flyer, or null */
  coverImage: string | null;
  summary: string;
  scope: ProposalScopeItem[];
  fees: ProposalFee[];
  feesNote: string;
  showTransactionFee: boolean;
  separate: ProposalScopeItem[];
  plan: ProposalPlanRow[];
  ebWill: string[];
  clientWill: string[];
  assumptions: string;
  confirmations: ProposalConfirmRow[];
  approval: string;
  closing: string;
  note: string;
};

/** Every workstream eventbuddy offers, with its standard wording; a proposal
 *  starts with the common ones ticked and the rest one click away. */
export const SCOPE_LIBRARY: (ProposalScopeItem & { on: boolean })[] = [
  { on: true, title: "Ticketing & registration", text: "Configure paid ticket sales with categories such as Early Bird, Regular and VIP. Final category names, prices, quantities and sales windows to be confirmed by the organisers." },
  { on: true, title: "Vendor/exhibitor sales", text: "Set up a vendor application and stand sales flow, with payment required to secure an approved slot. Stand types, prices, availability and approval rules to be supplied by the organisers." },
  { on: true, title: "Guest check-in", text: "Configure attendee check-in and support the check-in process on event day, subject to final staffing and venue arrangements." },
  { on: true, title: "Wrist tags", text: "Provide wrist tags for checked-in guests. Quantity, format, branding and supply cost to be confirmed once specifications are agreed." },
  { on: true, title: "Targeted social ads", text: "Coordinate targeted social media advertising to promote the event. The advertising budget is separate from the service fee and will be funded by the organisers." },
  { on: true, title: "On-site operations", text: "Event-day eventbuddy support for registration and check-in operations and issue escalation, based on the agreed run sheet and scope." },
  { on: false, title: "Promoters", text: "Open the event to eventbuddy promoters who sell tickets through their own links and earn commission only on tickets they sell. Commission rate and access rules to be set by the organisers." },
  { on: false, title: "Live event hub", text: "Give every ticket holder a live event hub with the agenda, speakers, moderated Q&A, live polls and announcements." },
  { on: false, title: "Multi-city tour", text: "Run the event across several cities on one tour page, each city with its own date, venue and tickets." },
  { on: false, title: "Badges & printing", text: "Supply printed name badges or tickets for attendees, exhibitors and staff. Quantity, format and supply cost to be confirmed once specifications are agreed." },
  { on: false, title: "Registration desks & staff", text: "Provide and coordinate registration desk staff for arrivals, walk-ups and enquiries, based on the agreed staffing plan." },
  { on: false, title: "Post-event report", text: "Deliver a post-event report covering ticket sales, registrations, check-ins, vendor activity and feedback." },
];

export function defaultProposal(eventName = ""): ProposalContent {
  const name = eventName || "the event";
  return {
    title: "Event Technology & On-site Attendee Management Proposal",
    eventName,
    preparedFor: "the Organising Team of",
    eventDate: "",
    eventTime: "",
    venue: "",
    attendance: "",
    coverImage: null,
    summary: `eventbuddy proposes to support ${name} with an integrated event operations setup covering online ticket sales, paid vendor/exhibitor applications, attendee registration, digital check-in, event-day support and social media advertising coordination. The objective is to give the organising team a clear view of sales and registrations before the event, while supporting a smoother arrival and check-in experience for guests on the day.`,
    scope: SCOPE_LIBRARY.filter((s) => s.on).map(({ title, text }) => ({ title, text })),
    fees: [{ item: "On-site eventbuddy support", detail: "Event-day support for attendee operations and check-in, delivered to the final agreed scope and staffing plan.", amountNaira: 250000 }],
    feesNote: "Excludes transaction fees, paid advertising spend and wrist-tag production/supply pending confirmation.",
    showTransactionFee: true,
    separate: [
      { title: "Paid advertising", text: "Campaign spend is paid by the organisers to the relevant advertising platform. The budget, campaign duration, audience/geographic targeting and any separate campaign management fee must be agreed before launch." },
      { title: "Wrist tags", text: "Supply/printing cost depends on the number required, material, branding and delivery timeline. No wrist-tag supply amount is included in this quote until specifications and quantity are confirmed." },
      { title: "Additional requirements", text: "Any extra equipment, extended staffing, travel/logistics, or work outside the approved scope will be discussed and approved in writing before charges are incurred." },
    ],
    plan: [
      { stage: "Confirm requirements", activity: "Confirm ticket categories, prices, quantities, sales dates, vendor stand types/prices and application rules.", input: "Approved pricing, inventory/slot counts, terms and event contact person." },
      { stage: "Configure sales", activity: "Set up ticketing and vendor sales flows, registration fields, confirmation messages and sales reporting.", input: "Review and approve the setup before public launch." },
      { stage: "Promotion", activity: "Prepare the agreed advertising plan, creatives/copy and targeting; launch only after approval and funding.", input: "Approved creative assets, campaign budget and access/authorisation where required." },
      { stage: "Pre-event readiness", activity: "Review attendee/vendor lists, check-in process, wrist-tag requirements, staff roles and event-day run sheet.", input: "Final guest estimates, tag specifications, venue access and operational contact list." },
      { stage: "Event day", activity: "Support the agreed on-site check-in and attendee operations; escalate issues to the designated organisers.", input: "Venue readiness, power/connectivity arrangements as agreed, and an organiser decision-maker on site." },
    ],
    ebWill: [
      "Configure the agreed ticket categories and vendor/exhibitor sales workflow on the platform.",
      "Provide sales/registration reporting through the platform and coordinate the agreed advertising workflow.",
      "Support event-day check-in and attendee operations within the scope agreed in writing.",
      "Coordinate wrist-tag specifications and production/supply arrangements once quantity and format are approved.",
    ],
    clientWill: [
      "Supply accurate event information, ticket prices/quantities, vendor stand details, event rules, branding assets and approved copy.",
      "Approve the event page, pricing, registration fields, advertising creative and campaign budget before publication or spend.",
      "Fund advertising spend and approve wrist-tag specifications and related costs separately.",
      "Provide timely access to the venue, an event-day point of contact, and any venue permissions or operational resources required.",
      "Confirm refund/cancellation policies, vendor terms, age/access restrictions if any, and the process for resolving attendee or vendor disputes.",
    ],
    assumptions:
      "This proposal is based on the expected attendance and event details shown above. Final staffing, check-in equipment, wrist-tag quantity, advertising plan and campaign management scope will be confirmed in a written run sheet. The proposal does not guarantee ticket sales, attendance, advertising performance or vendor uptake.",
    confirmations: [
      { item: "Ticket categories, prices, quantities and sales windows", status: "Pending organiser confirmation" },
      { item: "Vendor stand categories, prices, available slots and approval rules", status: "Pending organiser confirmation" },
      { item: "Advertising budget, platforms, campaign duration and management fee (if applicable)", status: "To be agreed" },
      { item: "Wrist-tag quantity, material, branding and supply cost", status: "To be confirmed and quoted" },
      { item: "Event-day staffing, check-in setup and run sheet", status: "To be finalised" },
    ],
    approval:
      "To proceed, the organisers can approve the fixed service fee in principle and confirm the outstanding items below. eventbuddy will then prepare the final implementation checklist and confirm any additional costs before work or spending begins.",
    closing: `We look forward to partnering with the ${eventName ? `${eventName} ` : ""}team to deliver a smooth, well-coordinated event experience.`,
    note: "This document is a proposal for review, not a final invoice. Fees for advertising management, ad spend, wrist tags and any out-of-scope requirements remain subject to written agreement. The fixed service fee and platform transaction fees are as stated above.",
  };
}

/** A proposal's fixed fees as the document's line items (so totals work like quotes). */
export const proposalLineItems = (c: ProposalContent) =>
  c.fees.filter((f) => f.item.trim()).map((f) => ({ description: f.item.trim(), quantity: 1, unitPriceNaira: Math.max(0, Number(f.amountNaira) || 0) }));

export const proposalTotal = (c: ProposalContent) => c.fees.reduce((s, f) => s + Math.max(0, Number(f.amountNaira) || 0), 0);

/** Fills in any section an older proposal doesn't have yet. */
export function withProposalDefaults(c: Partial<ProposalContent> | null | undefined): ProposalContent {
  return { ...defaultProposal(c?.eventName ?? ""), ...(c ?? {}) };
}
