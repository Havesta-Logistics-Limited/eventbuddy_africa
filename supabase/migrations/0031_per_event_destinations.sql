-- Destinations (and, transitively through them, universities) become owned by a
-- single event rather than shared org-wide — each Education Fair event gets its own
-- independent destination/university list now, matching how these fairs actually
-- run in practice (per the explicit decision: fully isolated per event, with a
-- "copy from another event" convenience built at the app layer instead of sharing).
--
-- Existing data: a destination currently used by exactly one event becomes that
-- event's own copy in place; a destination used by multiple events gets duplicated
-- once per event that uses it (independent copies from that point on), and any
-- lead/staff row referencing the original shared id is repointed to the correct
-- per-event copy. A destination referenced by no event is deleted as an orphan.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.destinations add column if not exists event_id uuid references public.events (id) on delete cascade;
create index if not exists destinations_event_id_idx on public.destinations (event_id);

-- Old->new id mappings created while duplicating, scoped to the event the duplicate
-- was made for — used below to repoint leads/staff that referenced the original
-- shared destination/university before this event got its own independent copy.
create temporary table _dest_remap (event_id uuid, old_dest_id text, new_dest_id text) on commit drop;
create temporary table _uni_remap (event_id uuid, old_uni_id text, new_uni_id text) on commit drop;

do $$
declare
  ev record;
  old_dest_id text;
  new_dest_id text;
  d record;
  u record;
  new_uni_id text;
  updated_ids text[];
begin
  for ev in select id, destination_ids from public.events where destination_ids is not null and array_length(destination_ids, 1) > 0 order by created_at loop
    updated_ids := array[]::text[];
    foreach old_dest_id in array ev.destination_ids loop
      select * into d from public.destinations where id = old_dest_id;
      if not found then
        continue; -- stale id on the event, nothing to migrate
      end if;

      if d.event_id is null then
        -- first (oldest) event to reference this destination becomes its owner —
        -- no duplication needed, it keeps its existing id.
        update public.destinations set event_id = ev.id where id = old_dest_id;
        updated_ids := array_append(updated_ids, old_dest_id);
      else
        -- already claimed by an earlier event — this event gets its own independent copy.
        new_dest_id := 'dest_' || gen_random_uuid();
        insert into public.destinations (id, organization_id, name, flag, event_id)
          values (new_dest_id, d.organization_id, d.name, d.flag, ev.id);
        insert into _dest_remap values (ev.id, old_dest_id, new_dest_id);

        for u in select * from public.universities where destination_id = old_dest_id loop
          new_uni_id := 'uni_' || gen_random_uuid();
          insert into public.universities (id, organization_id, destination_id, name, short_name)
            values (new_uni_id, u.organization_id, new_dest_id, u.name, u.short_name);
          insert into _uni_remap values (ev.id, u.id, new_uni_id);
        end loop;

        updated_ids := array_append(updated_ids, new_dest_id);
      end if;
    end loop;

    update public.events set destination_ids = updated_ids where id = ev.id;
  end loop;
end $$;

-- Repoint leads/staff that referenced a destination/university this event just got
-- its own duplicate of, scoped to the specific event the duplicate belongs to (a
-- lead/staff row always belongs to one event, so this only ever touches rows that
-- actually needed to move).
update public.leads l set destination_id = r.new_dest_id from _dest_remap r where l.event_id = r.event_id and l.destination_id = r.old_dest_id;
update public.leads l set university_id = r.new_uni_id from _uni_remap r where l.event_id = r.event_id and l.university_id = r.old_uni_id;
update public.staff s set destination_id = r.new_dest_id from _dest_remap r where s.event_id = r.event_id and s.destination_id = r.old_dest_id;
update public.staff s set university_id = r.new_uni_id from _uni_remap r where s.event_id = r.event_id and s.university_id = r.old_uni_id;

-- Orphans — a destination never referenced by any event's destination_ids at all —
-- have no event to belong to under the new model, so they're removed rather than
-- left ownerless.
delete from public.universities where destination_id in (select id from public.destinations where event_id is null);
delete from public.destinations where event_id is null;

alter table public.destinations alter column event_id set not null;
