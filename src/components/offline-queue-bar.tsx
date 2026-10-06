"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { useLeadSync, usePendingLeadCount } from "@/hooks/useLeadSync";

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * The one piece of offline UI a staff member actually needs: how many captures
 * are still on this phone, and a way to push them now.
 *
 * Mounted app-wide, and it renders nothing at all when the queue is empty and
 * the device is online — so it stays invisible on a normal day and becomes
 * impossible to miss on a bad one.
 */
export function OfflineQueueBar() {
  const { sync, syncing } = useLeadSync();   // also drives the app-wide sync loop
  const pending = usePendingLeadCount();
  const [justSent, setJustSent] = useState(0);

  // Subscribed rather than mirrored into state: connectivity is an external
  // system, and reading it in an effect just causes a second render.
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  // Briefly confirm a successful flush, so pressing Sync always visibly does
  // something even when the queue empties instantly.
  useEffect(() => {
    if (justSent === 0) return;
    const id = setTimeout(() => setJustSent(0), 3000);
    return () => clearTimeout(id);
  }, [justSent]);

  if (pending === 0 && online && justSent === 0) return null;

  const offlineOnly = pending === 0 && !online;

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2.5 shadow-lg backdrop-blur bg-surface/95 border-line"
      >
        {justSent > 0 ? (
          <>
            <Check className="w-4 h-4 text-teal-300 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium text-fg">
              Synced {justSent} {justSent === 1 ? "lead" : "leads"}
            </span>
          </>
        ) : (
          <>
            <CloudOff className={`w-4 h-4 shrink-0 ${online ? "text-[#C21FAF]" : "text-[#E85D0A]"}`} aria-hidden="true" />
            <span className="text-sm font-medium text-fg tabular-nums">
              {offlineOnly
                ? "Offline — captures will be saved on this device"
                : `${pending} ${pending === 1 ? "lead" : "leads"} saved on this device`}
            </span>
            {pending > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const sent = await sync(true);
                  if (sent > 0) setJustSent(sent);
                }}
                disabled={syncing || !online}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#C21FAF] px-3 py-1.5 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#A8158F]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
                {syncing ? "Syncing" : online ? "Sync now" : "Waiting for signal"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
