"use client";

/**
 * Service-worker registration.
 *
 * The worker exists for one job: keep /collect and /checkin usable on a venue's
 * dead WiFi. Without it a staff phone that locks, or a tab that gets discarded,
 * loads nothing at all when reopened offline — the queued leads are still safe
 * in IndexedDB, but unreachable, which is the worst of both worlds.
 *
 * It also flushes the queue from a background sync where the browser supports
 * one (Chrome/Android), so leads can leave the device with no tab open. iOS has
 * no Background Sync; there the foreground sync in useLeadSync is the whole
 * story, which is why that still runs on every screen.
 */

export const SYNC_TAG = "eventbuddy-flush-leads";

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // A worker registered from a dev build caches half-built assets and is more
  // confusing than useful.
  if (process.env.NODE_ENV !== "production") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed:", err);
    });
  });
}

/** Ask the worker to flush the queue even if this tab goes away. No-op where
 *  Background Sync is missing — the in-page sync still covers it. */
export function requestBackgroundSync(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      const withSync = reg as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      return withSync.sync?.register(SYNC_TAG);
    })
    .catch(() => { /* unsupported or denied — foreground sync handles it */ });
}
