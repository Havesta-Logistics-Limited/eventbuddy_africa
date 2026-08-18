import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely. Only use this
 * inside trusted server-side code (Route Handlers), never in a Server Component or
 * anywhere reachable from the browser.
 *
 * This exists because staff/rep check-in (src/lib/store.ts's loginAsStaff/loginAsRep)
 * is a lightweight, no-password device session — not a Supabase Auth session — so
 * auth.uid() is null for those requests and the normal RLS policies would reject them.
 * Route Handlers using this client are responsible for validating the event/access
 * code themselves before touching the database.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
