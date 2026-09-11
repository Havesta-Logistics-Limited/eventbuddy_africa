import { createClient } from "./client";

export const EVENT_MEDIA_BUCKET = "event-media";
const BUCKET = EVENT_MEDIA_BUCKET;

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/^data:(.*);base64$/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Uploads a compressImageFile/getCroppedImage data URL to the event-media bucket
 *  at `{path}.jpg` — upsert, so replacing an image overwrites the old file instead
 *  of leaving it orphaned, matching the path convention documented in migration
 *  0074_event_media_bucket.sql (`{organizationId}/covers/{eventId}`,
 *  `{organizationId}/logo`, `{organizationId}/speakers/{speakerId}`) — and returns
 *  the public URL to store in place of the data URL. No-ops on anything that isn't
 *  a data URL, so re-saving an already-uploaded URL (e.g. an unedited photoUrl
 *  passed back through a form) is always safe. */
export async function uploadEventMedia(path: string, dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const supabase = createClient();
  const blob = dataUrlToBlob(dataUrl);
  const fullPath = `${path}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(fullPath, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
}

/** Removes the file at `{path}.jpg`, if any — used wherever a cover/logo/photo
 *  column is cleared or its owning event/speaker/org row is deleted, so the
 *  bucket doesn't accumulate files nothing references any more. Best-effort:
 *  never throws, since cleanup failing shouldn't block the delete/save that
 *  triggered it (and removing a path that was never uploaded, e.g. one that
 *  only ever held a pasted external URL, is expected to be a no-op). */
export async function deleteEventMedia(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(BUCKET).remove([`${path}.jpg`]);
}

/** Copies an already-uploaded file to a new entity's own path — used when
 *  duplicateEvent copies a cover image, so the duplicate owns an independent
 *  file instead of sharing the original's path. Without this, deleting the
 *  original event would delete the file out from under the duplicate too.
 *  Returns the new public URL, or null if there was nothing to copy (e.g. the
 *  source was a pasted external URL, never actually stored here) or the copy
 *  failed. */
export async function copyEventMedia(fromPath: string, toPath: string): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).copy(`${fromPath}.jpg`, `${toPath}.jpg`);
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${toPath}.jpg`);
  return data.publicUrl;
}

/** Whether a URL points at a file this app itself uploaded to the event-media
 *  bucket, as opposed to a pasted external image URL — the two need different
 *  handling on delete/duplicate (only our own files are ours to remove or copy). */
export function isEventMediaUrl(url: string): boolean {
  return url.includes(`/storage/v1/object/public/${BUCKET}/`);
}
