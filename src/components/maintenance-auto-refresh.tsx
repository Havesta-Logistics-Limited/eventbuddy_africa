"use client";

import { useEffect } from "react";
import { fetchMaintenanceState } from "@/lib/maintenance";

const POLL_MS = 20_000;

/** Progressive enhancement only — the maintenance page itself is a Server Component
 *  that renders correctly with zero JS. This just saves a visitor from having to
 *  manually reload once a platform admin flips maintenance mode back off. */
export function MaintenanceAutoRefresh() {
  useEffect(() => {
    const id = setInterval(async () => {
      const state = await fetchMaintenanceState().catch(() => null);
      if (state && !state.maintenanceMode) window.location.reload();
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
