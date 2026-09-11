-- Storage bucket for event covers, organization logos, and speaker photos —
-- replaces storing these as base64 directly in events.cover_image/
-- organizations.logo_url/event_speakers.photo_url, which was inflating every
-- select("*") response (including routes that never display the image) and
-- pushing the database toward its size limit faster than real usage volume
-- alone would suggest. Public bucket (these are already public-facing content
-- on registration/org-profile pages) — write access scoped by path, same
-- owned_organization_ids() pattern the rest of the schema already uses.
-- Path convention: {organizationId}/covers/{eventId}.jpg, {organizationId}/logo.jpg,
-- {organizationId}/speakers/{speakerId}.jpg — always the same path per entity
-- (upsert on upload), so replacing an image overwrites the old file instead of
-- leaving it orphaned.

insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

create policy "event_media_insert_own_org" on storage.objects
  for insert with check (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1]::uuid in (select public.owned_organization_ids())
  );

create policy "event_media_update_own_org" on storage.objects
  for update using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1]::uuid in (select public.owned_organization_ids())
  );

create policy "event_media_delete_own_org" on storage.objects
  for delete using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1]::uuid in (select public.owned_organization_ids())
  );
