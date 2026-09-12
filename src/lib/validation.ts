/** Shared across every form on the platform that collects an email address or
 *  phone number, so "what counts as valid" can't drift between them. Phone
 *  matches the regex/length bounds /api/signup/route.ts already enforces
 *  server-side, so client and server agree on what a valid phone looks like. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value.trim());
}

/** Strips anything that can't be part of a phone number — digits, +, -, (),
 *  and spaces — so a letter is rejected the moment it's typed, not just at
 *  submit. Used as an onChange filter, never as the only guard: still pair
 *  with isValidPhone() before submit to catch a too-short/too-long result. */
export function sanitizePhoneInput(value: string): string {
  return value.replace(/[^0-9+()\-\s]/g, "");
}
