import type { SupabaseClient } from "@supabase/supabase-js";
import { planTicketFee, ticketFeeFromSettings, type TicketFee } from "@/lib/billing";

export type FeeSource = "exempt" | "custom" | "plan" | "default";

/** A custom rate's two parts, or null when the organizer has none (migration 0126). */
export function customTicketFee(org: { custom_fee_percentage?: unknown; custom_fee_flat_naira?: unknown } | null | undefined): TicketFee | null {
  if (org?.custom_fee_percentage == null || org?.custom_fee_flat_naira == null) return null;
  const pct = Number(org.custom_fee_percentage);
  const flat = Number(org.custom_fee_flat_naira);
  return Number.isFinite(pct) && Number.isFinite(flat) ? { percentage: pct, flatNaira: flat } : null;
}

/**
 * eventbuddy's fee for one organizer, read live, the one place ticket checkout
 * and stand payments both get it from. Precedence: fee-exempt (nothing) >
 * their custom agreed rate (0126) > their plan's rate (0104) > the platform
 * default (platform_settings).
 */
export async function organizerTicketFee(admin: SupabaseClient, orgId: string): Promise<{ fee: TicketFee; source: FeeSource; planId: string }> {
  const [{ data: org }, { data: settings }, { data: planId }] = await Promise.all([
    admin.from("organizations").select("is_fee_exempt, custom_fee_percentage, custom_fee_flat_naira").eq("id", orgId).maybeSingle(),
    admin.from("platform_settings").select("ticket_fee_percentage, ticket_fee_flat_naira").eq("id", true).maybeSingle(),
    admin.rpc("effective_plan_id", { p_org: orgId }),
  ]);
  const plan = (planId as string | null) ?? "launch";
  if (org?.is_fee_exempt) return { fee: { percentage: 0, flatNaira: 0 }, source: "exempt", planId: plan };
  const custom = customTicketFee(org);
  if (custom) return { fee: custom, source: "custom", planId: plan };
  const platformDefault = ticketFeeFromSettings(settings);
  const { data: planRow } = await admin.from("organizer_plans").select("fee_percentage, fee_flat_naira").eq("id", plan).maybeSingle();
  const fee = planTicketFee(planRow, platformDefault);
  const isDefault = fee.percentage === platformDefault.percentage && fee.flatNaira === platformDefault.flatNaira;
  return { fee, source: isDefault ? "default" : "plan", planId: plan };
}
