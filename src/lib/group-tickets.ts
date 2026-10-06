import { isValidEmail } from "./validation";

/** One guest on a group (bundle) ticket, named by the buyer at checkout. */
export type GroupGuest = { firstName: string; lastName: string; email: string };

/** Validates the guests a buyer entered for a group ticket. `groupSize` is how
 *  many the ticket admits; the buyer is one of them, so exactly groupSize - 1
 *  guests are needed. Returns the cleaned list, or a readable error. Shared by
 *  the checkout API and its tests so the rule can't drift. */
export function validateGroupGuests(
  groupSize: number,
  raw: unknown,
  buyerEmail: string,
): { ok: true; guests: GroupGuest[] } | { ok: false; error: string } {
  const needed = Math.max(0, Math.floor(groupSize) - 1);
  if (needed === 0) return { ok: true, guests: [] };
  const list = Array.isArray(raw) ? raw : [];
  if (list.length !== needed) {
    return { ok: false, error: `This ticket admits ${needed + 1} people. Add the name and email of all ${needed} guest${needed === 1 ? "" : "s"}.` };
  }
  const seen = new Set([buyerEmail.trim().toLowerCase()]);
  const guests: GroupGuest[] = [];
  for (let i = 0; i < list.length; i++) {
    const g = (list[i] ?? {}) as Partial<GroupGuest>;
    const firstName = String(g.firstName ?? "").trim();
    const lastName = String(g.lastName ?? "").trim();
    const email = String(g.email ?? "").trim();
    const n = i + 2; // the buyer is person 1
    if (!firstName || !lastName) return { ok: false, error: `Enter guest ${n}'s full name.` };
    if (!isValidEmail(email)) return { ok: false, error: `Enter a valid email for guest ${n}.` };
    const key = email.toLowerCase();
    // every guest gets their own ticket email, so one inbox per person
    if (seen.has(key)) return { ok: false, error: `Guest ${n}'s email is already used by someone else in this group.` };
    seen.add(key);
    guests.push({ firstName, lastName, email });
  }
  return { ok: true, guests };
}
