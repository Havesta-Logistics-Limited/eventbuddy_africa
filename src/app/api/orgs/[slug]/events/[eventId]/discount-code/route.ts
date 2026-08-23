import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

type ValidateBody = { code: string; ticketTypeId: string; email?: string };

type DiscountCodeValidation = {
  valid: boolean;
  error_message: string | null;
  discount_code_id: string | null;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number | null;
  max_discount_naira: number | null;
};

/**
 * Public discount-code preview for the registration page's "have a code?" field —
 * no session required. Uses the anon client + the same security-definer RPC
 * (public_validate_discount_code) the real purchase-initialize route calls, so a
 * buyer's preview always matches what they'll actually be charged.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/discount-code">) {
  const { eventId } = await ctx.params;
  const body = (await request.json()) as Partial<ValidateBody>;
  const code = body.code?.trim();
  const ticketTypeId = body.ticketTypeId;
  if (!code || !ticketTypeId) return NextResponse.json({ error: "Enter a code." }, { status: 400 });

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .rpc("public_validate_discount_code", { p_event_id: eventId, p_code: code, p_ticket_type_id: ticketTypeId, p_email: body.email?.trim() || null })
    .maybeSingle<DiscountCodeValidation>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.valid || !data.discount_type || data.discount_value == null) {
    return NextResponse.json({ error: data?.error_message || "This code isn't valid for this event." }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    discountType: data.discount_type,
    discountValue: Number(data.discount_value),
    maxDiscountNaira: data.max_discount_naira != null ? Number(data.max_discount_naira) : null,
  });
}
