import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";

/**
 * Guards against fake events (migration 0111). Until a platform admin verifies
 * an organizer (organizations.payout_verified), their paid ticket sales stop
 * at platform_settings.unverified_ticket_cap across all their events, and
 * platform admins are alerted when they near or hit it, or sell a lot in a
 * day. Free registrations are never capped.
 */

type Limit = { verified: boolean; cap: number | null; sold: number; spike: number };

async function readLimit(admin: SupabaseClient, orgId: string): Promise<Limit> {
  const [{ data: org }, { data: settings }, { data: sold }] = await Promise.all([
    admin.from("organizations").select("payout_verified").eq("id", orgId).maybeSingle(),
    admin.from("platform_settings").select("unverified_ticket_cap, risk_spike_tickets").eq("id", true).maybeSingle(),
    admin.rpc("org_paid_tickets_sold", { p_org: orgId }),
  ]);
  return {
    verified: Boolean(org?.payout_verified),
    cap: settings?.unverified_ticket_cap == null ? null : Number(settings.unverified_ticket_cap),
    sold: Number(sold ?? 0),
    spike: Number(settings?.risk_spike_tickets ?? 30),
  };
}

/** Before a paid purchase (ticket or stand) starts: may this organizer take
 *  another payment? Counts completed sales plus checkouts started in the last
 *  hour, so many buyers paying at once can't all slip past the limit. */
export async function checkSalesCap(admin: SupabaseClient, orgId: string, eventId: string): Promise<{ allowed: true } | { allowed: false; message: string }> {
  try {
    const l = await readLimit(admin, orgId);
    if (l.verified || l.cap == null) return { allowed: true };
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const [{ count: inCheckout }, { count: stands }] = await Promise.all([
      admin.from("paystack_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending").in("purpose", ["ticket_purchase", "stand_booking"]).gt("amount_naira", 0).gte("created_at", since),
      admin.from("paystack_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "success").eq("purpose", "stand_booking"),
    ]);
    if (l.sold + (stands ?? 0) + (inCheckout ?? 0) < l.cap) return { allowed: true };
    await raiseAlert(admin, { orgId, eventId, kind: "cap_reached", tickets: l.sold, key: `cap_reached:${orgId}` });
    return { allowed: false, message: "Ticket sales for this event are paused for now while the organizer's account is being verified. Please check back soon." };
  } catch (err) {
    // never block a sale because the guard itself failed
    console.error("[sales-guard] cap check failed:", err instanceof Error ? err.message : err);
    return { allowed: true };
  }
}

/** After a paid sale succeeds: alert platform admins at the thresholds. Best effort. */
export async function recordSaleRisk(admin: SupabaseClient, orgId: string, eventId: string): Promise<void> {
  try {
    const l = await readLimit(admin, orgId);
    if (l.verified) return;
    if (l.cap != null && l.sold >= l.cap) {
      await raiseAlert(admin, { orgId, eventId, kind: "cap_reached", tickets: l.sold, key: `cap_reached:${orgId}` });
    } else if (l.cap != null && l.sold >= Math.ceil(l.cap * 0.8)) {
      await raiseAlert(admin, { orgId, eventId, kind: "cap_near", tickets: l.sold, key: `cap_near:${orgId}` });
    }
    const { data: lastDay } = await admin.rpc("org_paid_tickets_sold", { p_org: orgId, p_since: new Date(Date.now() - 24 * 3600 * 1000).toISOString() });
    if (Number(lastDay ?? 0) >= l.spike) {
      const day = new Date().toISOString().slice(0, 10);
      await raiseAlert(admin, { orgId, eventId, kind: "sales_spike", tickets: Number(lastDay), key: `sales_spike:${orgId}:${day}` });
    }
  } catch (err) {
    console.error("[sales-guard] risk check failed:", err instanceof Error ? err.message : err);
  }
}

const KIND_TEXT: Record<"cap_near" | "cap_reached" | "sales_spike", (n: number) => string> = {
  cap_near: (n) => `is close to the unverified sales limit (${n} paid tickets sold)`,
  cap_reached: (n) => `has hit the unverified sales limit (${n} paid tickets sold). Their ticket sales are paused until you verify them`,
  sales_spike: (n) => `sold ${n} paid tickets in the last 24 hours`,
};

async function raiseAlert(
  admin: SupabaseClient,
  a: { orgId: string; eventId: string; kind: "cap_near" | "cap_reached" | "sales_spike"; tickets: number; key: string }
) {
  // one alert per threshold: the unique dedupe_key makes a repeat a no-op
  const { data: inserted } = await admin
    .from("risk_alerts")
    .upsert({ organization_id: a.orgId, event_id: a.eventId, kind: a.kind, tickets: a.tickets, dedupe_key: a.key }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (!inserted?.length) return;
  await emailPlatformAdmins(admin, a);
}

async function emailPlatformAdmins(admin: SupabaseClient, a: { orgId: string; eventId: string; kind: keyof typeof KIND_TEXT; tickets: number }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return;
  const [{ data: admins }, { data: org }, { data: event }] = await Promise.all([
    admin.from("platform_admins").select("email"),
    admin.from("organizations").select("name, email, created_at").eq("id", a.orgId).maybeSingle(),
    admin.from("events").select("name").eq("id", a.eventId).maybeSingle(),
  ]);
  const to = (admins ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e);
  if (!to.length) return;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://eventbuddy.africa";
  const orgName = org?.name ?? "An organizer";
  const line = `${orgName} ${KIND_TEXT[a.kind](a.tickets)}.`;
  const body = `
    <p style="margin:0 0 14px;"><strong>${escapeHtml(line)}</strong></p>
    <p style="margin:0 0 6px;">Event: ${escapeHtml(event?.name ?? "Unknown")}</p>
    <p style="margin:0 0 6px;">Organizer email: ${escapeHtml(org?.email ?? "Unknown")}</p>
    <p style="margin:0 0 20px;">Account created: ${org?.created_at ? new Date(org.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"}</p>
    <p style="margin:0 0 20px;">This account isn't verified yet. Check the event is real before verifying them; verifying lifts the limit.</p>
    ${emailButton(`${siteUrl}/platform?tab=payouts`, "Review in the platform portal", "#C21FAF")}
  `;
  try {
    await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Risk alert: ${orgName}`,
      text: `${line}\nEvent: ${event?.name ?? "Unknown"}\nReview: ${siteUrl}/platform?tab=payouts`,
      html: renderEmailShell({ color: "#C21FAF", label: "Risk alert", emoji: "⚠️" }, body),
    });
  } catch (err) {
    console.error("[sales-guard] alert email failed:", err instanceof Error ? err.message : err);
  }
}
