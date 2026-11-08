import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";

type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price_naira: number;
  quantity_available: number | null;
  quantity_sold: number;
  sales_start: string | null;
  sales_end: string | null;
  group_size?: number | null;
};

/**
 * Public ticket-type listing for an event's registration page — no session required.
 * Mirrors /api/orgs/[slug]/events: the anon client plus a security-definer RPC
 * (public_event_ticket_types) is the trust boundary, scoped to published events only.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/tickets">) {
  const { eventId } = await ctx.params;

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("public_event_ticket_types", { p_event_id: eventId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as TicketTypeRow[];

  // Whether a usable discount code exists for each ticket, so the page only
  // shows the "Discount code" box when there's something to enter (an empty
  // box sends buyers off hunting for a code that doesn't exist). Only a yes/no
  // leaves the server, never the codes. Same rules as checkout
  // (public_validate_discount_code): started, not ended, uses left, covers
  // this ticket, ticket meets the minimum price.
  const hasCode = new Set<string>();
  if (rows.some((t) => Number(t.price_naira) > 0)) {
    const { data: codes } = await createAdminClient()
      .from("discount_codes")
      .select("ticket_type_ids, starts_at, ends_at, max_uses, uses_count, min_spend_naira")
      .eq("event_id", eventId);
    const now = Date.now();
    for (const c of codes ?? []) {
      if (c.starts_at && new Date(c.starts_at).getTime() > now) continue;
      if (c.ends_at && new Date(c.ends_at).getTime() < now) continue;
      if (c.max_uses != null && c.uses_count >= c.max_uses) continue;
      for (const t of rows) {
        const price = Number(t.price_naira);
        if (price <= 0) continue;
        if (c.ticket_type_ids && !(c.ticket_type_ids as string[]).includes(t.id)) continue;
        if (c.min_spend_naira != null && price < Number(c.min_spend_naira)) continue;
        hasCode.add(t.id);
      }
    }
  }

  return NextResponse.json({
    ticketTypes: rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      priceNaira: Number(t.price_naira),
      quantityAvailable: t.quantity_available,
      quantitySold: t.quantity_sold,
      salesStart: t.sales_start ?? undefined,
      salesEnd: t.sales_end ?? undefined,
      groupSize: Math.max(1, Number(t.group_size ?? 1)),
      hasDiscountCode: hasCode.has(t.id),
    })),
  });
}
