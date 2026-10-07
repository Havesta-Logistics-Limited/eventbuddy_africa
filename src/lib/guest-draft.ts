import { z } from "zod";

/**
 * An event built on /create before the visitor has an account. It lives in the
 * browser while they work, travels with the sign-up request (so it's saved
 * whichever device they confirm their email on), and becomes a draft event of
 * their new organization. A visitor who logs in instead "claims" it from the
 * dashboard.
 */

export type GuestTicket = { name: string; priceNaira: number; quantityAvailable: number | null; groupSize: number };

export const GUEST_DRAFT_KEY = "eventbuddy:guest-draft";
/** Set when the visitor chose "log in instead": the dashboard saves the draft. */
export const GUEST_CLAIM_KEY = "eventbuddy:guest-draft-claim";
/** Set after sign-up saved the draft: the first dashboard visit opens it. */
export const OPEN_EVENT_KEY = "eventbuddy:open-event";

// the registration questions (FieldDef in types.ts)
const FieldSchema = z.object({
  id: z.string().max(80),
  label: z.string().max(300),
  type: z.string().max(40),
  required: z.boolean().default(false),
  options: z.array(z.string().max(200)).max(50).optional(),
});

export const GuestDraftSchema = z.object({
  event: z.object({
    name: z.string().trim().min(1).max(160),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().or(z.literal("")),
    endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().or(z.literal("")),
    location: z.string().max(200).default(""),
    venue: z.string().max(200).default(""),
    description: z.string().max(20000).default(""),
    // the wizard keeps uploaded covers as compressed data: URLs; a pasted link is https
    coverImage: z
      .string()
      .max(3_000_000)
      .refine((v) => /^data:image\/(png|jpe?g|webp);base64,/.test(v) || (/^https:\/\//.test(v) && v.length <= 2000), "Unsupported cover image.")
      .optional()
      .or(z.literal("")),
    customFields: z.array(FieldSchema).max(40).default([]),
    timezone: z.string().max(64).optional(),
    eventFormat: z.enum(["physical", "virtual"]).default("physical"),
    category: z.string().max(80).optional(),
    // "Who can attend": open sign-up, staff-only capture, or invite-only
    selfRegistrationEnabled: z.boolean().default(true),
    isInviteOnly: z.boolean().default(false),
    virtualJoinUrl: z.string().max(500).optional(),
    virtualPlatform: z.string().max(100).optional(),
    virtualAccessNotes: z.string().max(2000).optional(),
  }),
  tickets: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        priceNaira: z.number().int().min(0).max(10_000_000),
        quantityAvailable: z.number().int().min(1).max(1_000_000).nullable(),
        groupSize: z.number().int().min(1).max(20),
      })
    )
    .max(20),
});

export type GuestDraft = z.infer<typeof GuestDraftSchema>;

export function slugifyEventName(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "event"
  );
}

// ---- browser storage (best effort: private windows can refuse) ----

export function readStoredDraft(): { draft: GuestDraft; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(GUEST_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft: GuestDraft; savedAt: number };
    // a month-old half-built event isn't worth resurrecting
    if (!parsed?.draft?.event || Date.now() - parsed.savedAt > 30 * 864e5) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeDraft(draft: GuestDraft) {
  try {
    localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ draft, savedAt: Date.now() }));
  } catch {
    // over the storage quota: keep everything but the cover
    try {
      localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ draft: { ...draft, event: { ...draft.event, coverImage: undefined } }, savedAt: Date.now() }));
    } catch {
      /* storage unavailable */
    }
  }
}

export function clearStoredDraft() {
  try {
    localStorage.removeItem(GUEST_DRAFT_KEY);
    localStorage.removeItem(GUEST_CLAIM_KEY);
  } catch {
    /* ignore */
  }
}
