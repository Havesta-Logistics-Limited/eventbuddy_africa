-- Fixes event-media uploads (2026-10-07). Covers, logos and speaker photos
-- have been stored inline in the database as base64 since uploads were
-- "rejected for every authenticated user". The real cause: the app uploads
-- with upsert (so replacing an image overwrites the old file), and an upsert
-- needs SELECT on storage.objects as well as INSERT/UPDATE. The bucket had no
-- SELECT policy, so every upsert failed, while a plain insert worked.
--
-- The bucket is public, so anyone can already view a file by its URL; this
-- only lets an organization's members list and read their own folder.

drop policy if exists "event_media_select_own_org" on storage.objects;
create policy "event_media_select_own_org" on storage.objects
  for select using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1]::uuid in (select public.owned_organization_ids())
  );
