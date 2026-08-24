import { createClient } from "@/lib/supabase/client";

/**
 * Thin wrapper around Supabase Auth's native TOTP MFA — used identically by both
 * account pools in this app (an org admin's own Supabase Auth user, and a platform
 * admin's), since MFA lives on the underlying auth.users row regardless of which
 * app-level role checks (organizations.owner_user_id / platform_admins) gate what
 * that user can reach after signing in. Never a custom TOTP implementation — this
 * is Supabase's own enroll/challenge/verify flow end to end.
 */

export type MfaFactor = { id: string; status: "verified" | "unverified"; createdAt: string };

export async function listMfaFactors(): Promise<MfaFactor[]> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status, createdAt: f.created_at }));
}

/** A factor only counts once its enrollment code has actually been confirmed —
 *  an in-progress, never-verified enrollment shouldn't read as "2FA enabled." */
export async function getVerifiedFactor(): Promise<MfaFactor | null> {
  const factors = await listMfaFactors();
  return factors.find((f) => f.status === "verified") ?? null;
}

/** True when this session is signed in at password-only strength (aal1) but the
 *  account has a verified factor requiring a step-up to aal2 — i.e. the login flow
 *  must show a code prompt before the session is treated as fully authenticated. */
export async function needsStepUp(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export async function startEnrollment(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) throw new Error(error?.message || "Couldn't start 2FA setup. Please try again.");
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Shared by both "confirm a brand-new enrollment" and "step up an existing
 *  session at login" — both are just a fresh challenge immediately verified with
 *  the code the user just typed. */
export async function challengeAndVerify(factorId: string, code: string): Promise<void> {
  const supabase = createClient();
  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeErr || !challenge) throw new Error(challengeErr?.message || "Couldn't verify that code. Please try again.");
  const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
  if (verifyErr) throw new Error("That code didn't match — check the time on your authenticator app and try again.");
}

/** Removes a factor — used both to back out of an unfinished enrollment and to
 *  turn 2FA off entirely for a verified one. */
export async function removeFactor(factorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
