"use client";

import { addEvent, addTicketType } from "@/lib/store";
import { clearStoredDraft, readStoredDraft } from "@/lib/guest-draft";

/** Saves the browser's /create draft as a draft event of the signed-in
 *  organizer (who chose "log in instead" of signing up). Returns its id. */
export async function claimGuestDraft(): Promise<string | null> {
  const stored = readStoredDraft();
  if (!stored) return null;
  const { event: e, tickets } = stored.draft;
  const created = await addEvent({
    name: e.name,
    date: e.date,
    endDate: e.endDate || undefined,
    startTime: e.startTime || undefined,
    endTime: e.endTime || undefined,
    location: e.location,
    venue: e.venue,
    description: e.description,
    coverImage: e.coverImage || undefined,
    destinationIds: [],
    templateId: "custom",
    customFields: e.customFields as never,
    timezone: e.timezone,
    eventFormat: e.eventFormat,
    virtualJoinUrl: e.virtualJoinUrl,
    virtualPlatform: e.virtualPlatform,
    virtualAccessNotes: e.virtualAccessNotes,
    category: e.category,
    selfRegistrationEnabled: e.selfRegistrationEnabled,
    isInviteOnly: e.isInviteOnly,
    published: false,
  });
  for (const t of tickets) {
    await addTicketType({ eventId: created.id, name: t.name, priceNaira: t.priceNaira, quantityAvailable: t.quantityAvailable ?? undefined, groupSize: t.groupSize });
  }
  clearStoredDraft();
  return created.id;
}
