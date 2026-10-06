/** Shared across every form on the platform that collects an email address or
 *  phone number, so "what counts as valid" can't drift between them. Phone
 *  matches the regex/length bounds /api/signup/route.ts already enforces
 *  server-side, so client and server agree on what a valid phone looks like. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Character filter only: a loose shape check. Use isValidPhone() to validate. */
export const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Every phone field on the platform uses the strict check below (2026-10-06):
 *  real digit counts and Nigerian formats, not just allowed characters. */
export function isValidPhone(value: string): boolean {
  return normalizePhone(value) !== null;
}

/** Strips anything that can't be part of a phone number — digits, +, -, (),
 *  and spaces — so a letter is rejected the moment it's typed, not just at
 *  submit. Used as an onChange filter, never as the only guard: still pair
 *  with isValidPhone() before submit to catch a too-short/too-long result. */
export function sanitizePhoneInput(value: string): string {
  return value.replace(/[^0-9+()\-\s]/g, "");
}

/** Strict phone check (organizer signup, 2026-10-06). Counts real digits,
 *  understands Nigerian formats, and returns one canonical E.164-style form so
 *  the same number is always stored the same way. Returns null when invalid.
 *
 *    0801 234 5678 / 08012345678     → +2348012345678   (local: 0 + 10 digits)
 *    +234 801 234 5678 / 234801…     → +2348012345678
 *    +44 20 7946 0958                → +442079460958    (any country with +, 10–15 digits)
 *
 *  Rejects too few/many digits, a Nigerian number whose network digit isn't
 *  7/8/9, symbol-only input, and runs of one repeated digit (0000000000). */
export function normalizePhone(value: string): string | null {
  const raw = value.trim();
  if (!raw || /[^0-9+()\-\s]/.test(raw)) return null;
  if (raw.indexOf("+") > 0 || (raw.match(/\+/g) || []).length > 1) return null;
  const digits = raw.replace(/\D/g, "");
  let national: string | null = null;
  if (raw.startsWith("+")) {
    if (digits.startsWith("234")) national = digits.slice(3);
    else return digits.length >= 10 && digits.length <= 15 && !/^(\d)\1+$/.test(digits) ? `+${digits}` : null;
  } else if (digits.startsWith("234") && digits.length === 13) national = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 11) national = digits.slice(1);
  else return null;
  // Nigerian mobile and landline numbers: 10 digits after the country code,
  // starting 7, 8 or 9 (e.g. 703…, 803…, 905…).
  if (!/^[789]\d{9}$/.test(national) || /^(\d)\1+$/.test(national.slice(1))) return null;
  return `+234${national}`;
}

export function isValidPhoneStrict(value: string): boolean {
  return normalizePhone(value) !== null;
}

/** Server-side phone handling for an OPTIONAL field: blank stays blank, a
 *  valid number is stored canonically, anything else is an error message. */
export function optionalPhone(value: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = (value ?? "").trim();
  if (!v) return { ok: true, value: null };
  const n = normalizePhone(v);
  return n ? { ok: true, value: n } : { ok: false, error: "Enter a valid phone number, e.g. 0801 234 5678 or +234 801 234 5678." };
}
