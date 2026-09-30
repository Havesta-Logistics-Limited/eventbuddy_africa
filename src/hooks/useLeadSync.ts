"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { dequeue, initQueue, markAttempt, queueSnapshot, subscribeQueue } from "@/lib/offline-queue";
import { requestBackgroundSync } from "@/lib/sw-register";

/** Flush the offline lead queue. Safe to call at any time and from anywhere —
 *  it no-ops on an empty queue and respects each entry's backoff. Resolves with
 *  how many leads actually left the device. */
export async function flushLeadQueue(force = false): Promise<number> {
  const queue = queueSnapshot();
  if (queue.length === 0) return 0;

  let sent = 0;
  for (const lead of queue) {
    // Backoff, unless a person pressed Sync — then try everything now.
    if (!force && lead.lastAttempt) {
      const waited = Date.now() - new Date(lead.lastAttempt).getTime();
      // 1s, 2s, 4s… capped so an entry can never be parked for longer than a
      // staff member would wait before giving up on it.
      const delay = Math.min(Math.pow(2, lead.attempts) * 1000, 60_000);
      if (waited < delay) continue;
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead.data),
      });

      if (res.ok) {
        await dequeue(lead.id);
        sent++;
      } else if (res.status === 400) {
        // Permanent: it will never succeed unchanged, so stop retrying it.
        await dequeue(lead.id);
      } else {
        // Transient (429, 5xx, closed capture gate) — keep it, count the try.
        await markAttempt(lead);
      }
    } catch {
      // Offline. Count the attempt and stop: the rest will fail the same way.
      await markAttempt(lead);
      break;
    }
  }
  return sent;
}

/** Number of leads still waiting on this device, re-rendering as it changes. */
export function usePendingLeadCount(): number {
  return useSyncExternalStore(
    subscribeQueue,
    () => queueSnapshot().length,
    () => 0
  );
}

/**
 * Keeps the offline queue draining. Mounted once, app-wide (see AppChrome), so
 * it no longer matters which screen a staff member is on — the old version ran
 * only on /collect, so navigating away silently parked the queue.
 */
export function useLeadSync() {
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      return await flushLeadQueue(force);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    initQueue().then(() => {
      if (!cancelled) sync();
    });

    const onFocus = () => sync();
    const onOnline = () => {
      sync();
      requestBackgroundSync();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => sync(), 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [sync]);

  return { sync, syncing };
}
