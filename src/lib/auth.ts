"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./store";
import { Role, Session } from "./types";

function fallbackRouteFor(role: Role) {
  if (role === "admin") return "/dashboard";
  if (role === "staff") return "/collect";
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
      router.replace(fallbackRouteFor(session.role));
    }
  }, [ready, session, allowedRoles, router]);

  return ready && allowed ? session : null;
}
