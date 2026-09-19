"use client";

import { useEffect } from "react";
import { getPendingLeads, setPendingLeads } from "@/lib/store";
import { PendingLead } from "@/lib/types";

export function useLeadSync() {
  const syncLeads = async () => {
    const queue = getPendingLeads();
    if (queue.length === 0) return;

    console.log(`[LeadSync] Attempting to sync ${queue.length} leads...`);

    for (const lead of queue) {
      // Exponential backoff: skip if last attempt was too recent
      if (lead.lastAttempt) {
        const last = new Date(lead.lastAttempt).getTime();
        const now = Date.now();
        const delay = Math.pow(2, lead.attempts) * 1000; // 1s, 2s, 4s, 8s...
        if (now - last < delay) continue;
      }

      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead.data),
        });

        if (res.ok) {
          // Remove lead from queue on success
          const currentQueue = getPendingLeads();
          setPendingLeads(currentQueue.filter((l) => l.id !== lead.id));
          console.log(`[LeadSync] Successfully synced lead ${lead.id}`);
        } else if (res.status === 400) {
          // Hard failure (validation) - remove from queue to prevent infinite loop
          const currentQueue = getPendingLeads();
          setPendingLeads(currentQueue.filter((l) => l.id !== lead.id));
          console.error(`[LeadSync] Hard failure for lead ${lead.id}: ${res.status}`);
        } else {
          // Transient failure (403 Closed Gate, 500 Server Error) - update attempt count
          const currentQueue = getPendingLeads();
          const updatedQueue = currentQueue.map((l) =>
            l.id === lead.id
              ? { ...l, attempts: l.attempts + 1, lastAttempt: new Date().toISOString() }
              : l
          );
          setPendingLeads(updatedQueue);
          console.warn(`[LeadSync] Transient failure for lead ${lead.id}: ${res.status}`);
        }
      } catch (e) {
        // Network error - update attempt count
        const currentQueue = getPendingLeads();
        const updatedQueue = currentQueue.map((l) =>
          l.id === lead.id
            ? { ...l, attempts: l.attempts + 1, lastAttempt: new Date().toISOString() }
            : l
        );
        setPendingLeads(updatedQueue);
        console.error(`[LeadSync] Network error syncing lead ${lead.id}:`, e);
      }
    }
  };

  useEffect(() => {
    // 1. Sync on mount
    syncLeads();

    // 2. Sync on window focus
    window.addEventListener("focus", syncLeads);

    // 3. Sync when coming back online
    window.addEventListener("online", syncLeads);

    // 4. Heartbeat sync every 30 seconds
    const interval = setInterval(syncLeads, 30000);

    return () => {
      window.removeEventListener("focus", syncLeads);
      window.removeEventListener("online", syncLeads);
      clearInterval(interval);
    };
  }, []);
}
