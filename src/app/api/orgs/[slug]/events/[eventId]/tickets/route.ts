import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price_naira: number;
  quantity_available: number | null;
  quantity_sold: number;
  sales_start: string | null;
  sales_end: string | null;
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
    })),
  });
}
