import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "./server";

/** Resolves the signed-in user for a Route Handler from EITHER the web app's own
 *  cookie session (createClient/server.ts — the default for every browser call) OR
 *  an `Authorization: Bearer <token>` header, which is how the mobile app (a
 *  separate Expo app with no cookies shared with this domain) authenticates.
 *  Returned `supabase` carries the resolved user's RLS context either way — for
 *  the bearer path, passing the JWT as the client's own Authorization header
 *  makes PostgREST evaluate every subsequent `.from()` call as that user, exactly
 *  like the cookie-based client does. Use this instead of `createClient()`
 *  directly on any route a mobile client also needs to call. */
export async function resolveRouteUser(request: Request): Promise<{ user: User | null; supabase: SupabaseClient }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return { user, supabase };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}
