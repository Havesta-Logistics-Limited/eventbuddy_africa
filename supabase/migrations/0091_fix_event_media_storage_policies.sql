-- Re-asserts the event-media storage policies from 0074_event_media_bucket.sql.
-- Confirmed via a live reproduction (real signed-in owner, real org, real event —
-- not a hypothetical) that uploads to this bucket are being rejected with "new row
-- violates row-level security policy" even for the actual owner, while the exact
-- same owned_organization_ids() check succeeds for ordinary table inserts (events,
-- ticket_types) moments earlier in the same session. That means these three
-- policies never actually took effect in production, whatever caused it (most
-- likely: this part of 0074 silently failed or was skipped when it was pasted into
-- the SQL editor, since storage.objects policies need to be run as a role with
-- rights on the storage schema). This migration is a pure no-op if they're already
-- correct, and fixes them if they aren't.

drop policy if exists "event_media_insert_own_org" on storage.objects;
drop policy if exists "event_media_update_own_org" on storage.objects;
drop policy if exists "event_media_delete_own_org" on storage.objects;

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
