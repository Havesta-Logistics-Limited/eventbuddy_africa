-- public_org_staff_names (0002/0022) returns every staff name across the whole
-- org, with no event filter — so the staff check-in "Who are you?" picker shows
-- names from every event that org has ever run, not just the one being checked
-- into. A name that checked into event A yesterday keeps showing up in event
-- B's picker today, even though they've never touched event B's link, which
-- reads as a data leak between events even though it's really just a stale
-- convenience list.
--
-- Fixed by also returning each staff row's current event_id (not their real
-- id — that stays excluded, see 0022's security fix) so the client can filter
-- to "checked in for the event I'm looking at right now." event_id is already
-- public information (which events an org runs is public), unlike the row id,
-- which is a bearer session credential — so this doesn't reopen 0022's leak.
drop function if exists public.public_org_staff_names(text);

create function public.public_org_staff_names(org_slug text)
returns table (name text, event_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select s.name, s.event_id
  from public.staff s
  join public.organizations o on o.id = s.organization_id
  where lower(o.slug) = lower(org_slug) and s.role = 'staff';
$$;

grant execute on function public.public_org_staff_names(text) to anon, authenticated;
