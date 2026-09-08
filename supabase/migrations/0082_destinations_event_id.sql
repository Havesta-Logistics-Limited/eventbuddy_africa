-- destinations.event_id was supposed to exist since migration 0031
-- (per_event_destinations) but that migration was never actually applied to
-- this database — confirmed directly: the column doesn't exist today, which
-- is why "Add Destination" fails with "Could not find the 'event_id' column".
-- Deliberately NOT re-running 0031 as originally written: its cleanup step
-- deletes any destination not listed in some event's destination_ids array,
-- and today that would silently delete 3 real destinations (United Kingdom,
-- Ireland, United States) plus their ~30 universities, since only one event
-- ("Green House Effect") currently has a non-empty destination_ids array at
-- all. This version only adds the column and backfills the unambiguous case
-- (a destination an event's destination_ids array already points to) —
-- nothing is deleted, and event_id stays nullable rather than forcing a
-- not-null constraint that would require guessing an owner for the rest.
alter table public.destinations add column if not exists event_id uuid references public.events (id) on delete cascade;
create index if not exists destinations_event_id_idx on public.destinations (event_id);

update public.destinations d
set event_id = sub.event_id
from (
  select unnest(destination_ids) as dest_id, id as event_id
  from public.events
  where destination_ids is not null and array_length(destination_ids, 1) > 0
) sub
where d.id = sub.dest_id and d.event_id is null;
