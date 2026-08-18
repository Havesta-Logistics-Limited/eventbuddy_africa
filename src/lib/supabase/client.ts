"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser-side Supabase client — carries the signed-in admin's session (RLS-protected). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
