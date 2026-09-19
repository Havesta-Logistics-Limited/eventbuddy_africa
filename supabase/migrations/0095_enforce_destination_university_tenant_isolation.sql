-- Closes a real cross-tenant write gap found during a full security sweep.
-- destinations has both organization_id and event_id; universities has both
-- organization_id and destination_id. Every RLS write policy on these tables
-- only ever checked "organization_id in (select owned_organization_ids())" —
-- it validated the caller owns *an* org, but never that the row's secondary
-- foreign key (event_id / destination_id) actually belongs to that same org.
-- Same bug family as the destination-entanglement incident from earlier this
-- project (see project memory) — that incident's cause (destinations shared
-- many-to-many via events.destination_ids, removed in 0031) is architecturally
-- gone, but this narrower version survived: an org owner could insert a
-- universities row with organization_id = their own org but destination_id
-- pointing at a DIFFERENT org's destination (the FK only requires the row to
-- exist, not that it belongs to the same org), writing junk into a
-- competitor's destination list. Same shape for destinations.event_id vs. a
-- different org's event. The app's own UI never does this (both web and
-- mobile only ever offer the caller's own destinations/events to pick from),
-- so this only mattered to a deliberate/scripted call — but the database
-- itself should be the actual boundary, not just the UI.

create or replace function public.check_destination_event_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.events where id = new.event_id and organization_id = new.organization_id
  ) then
    raise exception 'destinations.event_id must belong to the same organization_id';
  end if;
  return new;
end;
$$;

drop trigger if exists destinations_check_event_org on public.destinations;
create trigger destinations_check_event_org
  before insert or update on public.destinations
  for each row execute function public.check_destination_event_org();

create or replace function public.check_university_destination_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.destinations where id = new.destination_id and organization_id = new.organization_id
  ) then
    raise exception 'universities.destination_id must belong to the same organization_id';
  end if;
  return new;
end;
$$;

drop trigger if exists universities_check_destination_org on public.universities;
create trigger universities_check_destination_org
  before insert or update on public.universities
  for each row execute function public.check_university_destination_org();
