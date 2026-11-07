/** Browser side of eventbuddy's Meta Pixel (the loader is
 *  src/components/meta-pixel.tsx). A no-op until NEXT_PUBLIC_META_PIXEL_ID is
 *  set, and when the Pixel is blocked (ad blockers, some iPhones); the server
 *  reports purchases on its own too (src/lib/meta-capi.ts). */

type Fbq = (...args: unknown[]) => void;

export function metaPixelEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_META_PIXEL_ID;
}

/** `eventId` lets Meta merge this with the server's copy of the same event. */
export function metaTrack(name: string, params?: Record<string, unknown>, eventId?: string): void {
  if (!metaPixelEnabled() || typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (!fbq) return;
  fbq("track", name, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

/** Purchase once per payment in this browser, even if the confirmation is
 *  reloaded (Meta also de-duplicates by event_id). */
export function metaTrackPurchaseOnce(reference: string, params: Record<string, unknown>): void {
  const key = `eb:meta-purchase:${reference}`;
  try {
    if (sessionStorage.getItem(key) || localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // storage blocked: Meta's own event_id de-duplication still applies
  }
  metaTrack("Purchase", params, reference);
}
