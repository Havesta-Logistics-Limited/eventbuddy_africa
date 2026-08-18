import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Plain anon-key client for server-side code that needs no user session — e.g. the
 * public, safe-columns-only event listing used by the org-scoped check-in picker
 * (public_org_events). Not cookie-aware; don't use this for anything that needs to
 * know who's signed in.
 */
export function createAnonClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
