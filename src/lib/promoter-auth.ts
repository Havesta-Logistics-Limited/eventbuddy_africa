import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PromoterRow = {
  id: string;
  user_id: string;
  handle: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_suspended: boolean;
  payout_bank_code: string | null;
  payout_account_number: string | null;
  payout_change_status: string;
};

/** The signed-in promoter (migration 0105), or the response to return instead. */
export async function requirePromoter(request: Request): Promise<{ user: User; promoter: PromoterRow } | { response: NextResponse }> {
  const { user } = await resolveRouteUser(request);
  if (!user) return { response: NextResponse.json({ error: "Sign in as a promoter first." }, { status: 401 }) };
  const { data } = await createAdminClient()
    .from("promoters")
    .select("id, user_id, handle, full_name, email, phone, is_suspended, payout_bank_code, payout_account_number, payout_change_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { response: NextResponse.json({ error: "This account isn't a promoter account." }, { status: 403 }) };
  if (data.is_suspended) return { response: NextResponse.json({ error: "Your promoter account is suspended. Contact eventbuddy." }, { status: 403 }) };
  return { user, promoter: data as PromoterRow };
}
