"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/sw-register";
import { OfflineQueueBar } from "@/components/offline-queue-bar";

/**
 * Mounted once in the root layout. Registers the service worker and runs the
 * lead-queue sync loop app-wide — previously the sync only ran on /collect, so
 * walking to another screen parked the queue until someone navigated back.
 *
 * Renders nothing unless there is something to say (queued leads, or the device
 * being offline).
 */
export function OfflineSupport() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return <OfflineQueueBar />;
}
