"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logout, useSession } from "./store";
import { createClient } from "./supabase/client";
import { Role, Session } from "./types";
import { canView, TEAM_SECTIONS, type TeamSection } from "./team-permissions";

function fallbackRouteFor(role: Role, eventId?: string) {
  if (role === "admin") return "/dashboard";
  if (role === "event_support") return eventId ? `/events/${eventId}` : "/dashboard";
  if (role === "staff") return "/collect";
  if (role === "promoter") return "/promoter";
  return "/leads";
}

/**
 * Redirects to "/login" if signed out, or to the caller's home route if signed in
 * with the wrong role. Pass a module-level constant for `allowedRoles` (not
 * an inline array literal) so the effect doesn't re-fire every render.
 *
 * Gated on `ready`: useSyncExternalStore's first render after a hard
 * navigation necessarily matches the server snapshot (session: null, since
 * the server can't read localStorage), and only resyncs to the real client
 * value on the render right after hydration. Without this gate, the
 * redirect effect fires against that transient null and bounces a
 * genuinely-logged-in user back to "/login" before the resync lands.
 */
export function useRequireRole(allowedRoles: Role[]): Session | null {
  const session = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const allowed = !!session && allowedRoles.includes(session.role);

  useEffect(() => {
    // Deliberate mount-flag idiom to bridge the SSR/hydration gap described
    // above — not a case the "avoid setState in effect" rule is meant to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
    } else if (!allowedRoles.includes(session.role)) {
      router.replace(fallbackRouteFor(session.role, session.eventId));
    }
  }, [ready, session, allowedRoles, router]);

  // Admin sessions are tied to a real Supabase Auth JWT plus an organizations row.
  // login() checks the org still exists at sign-in, but a tab that's been open since
  // before the org was deleted (e.g. from the platform admin portal) never re-runs
  // that check — its token stays valid even though nothing it can see or write exists
  // anymore, so every save would fail an RLS check with no clear explanation. Catch
  // that here instead, once per gated page, and sign out cleanly.
  useEffect(() => {
    if (!ready || !session || (session.role !== "admin" && session.role !== "event_support")) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: org } = await supabase.from("organizations").select("id").eq("owner_user_id", user.id).maybeSingle();
      if (org) return;
      // Not an owner — an admin/event_support member is still valid as long as
      // their membership row is still active.
      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!cancelled && !membership) {
        await logout();
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, session, router]);

  return ready && allowed ? session : null;
}

const SECTION_HOME: Record<TeamSection, string> = { events: "/dashboard", leads: "/leads", audience: "/audience", payouts: "/payouts", settings: "/admin" };

/**
 * Team permissions (migration 0137): sends a team member away from a page
 * they have no access to, to the first page they do have. Owners pass.
 */
export function useRequireSection(session: Session | null, section: TeamSection): boolean {
  const router = useRouter();
  const allowed = !session || session.role !== "admin" || canView(session.permissions, section);
  useEffect(() => {
    if (allowed || !session) return;
    const next = TEAM_SECTIONS.find((s) => canView(session.permissions, s));
    router.replace(next ? SECTION_HOME[next] : "/login");
  }, [allowed, session, router]);
  return allowed;
}
