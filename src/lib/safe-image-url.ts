/** Whether the server may fetch this image while rendering (the social
 *  preview, invitation flyers). Organizers set these URLs, and next/og fetches
 *  them from our server, so anything but our own storage (or an inline image)
 *  would let an organizer point the server at internal or huge addresses. */
export function isServerFetchableImage(url: string | null | undefined): url is string {
  if (!url) return false;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === new URL(base).host && u.pathname.startsWith("/storage/v1/object/public/event-media/");
  } catch {
    return false;
  }
}
