-- The last migration (0080) made a draft's registration page reachable at its
-- real /{orgSlug}/events/{id}/register link, but an event with a global slug
-- set (migration 0057) copies the SHORTER /{slug} link instead — resolved by
-- public_event_by_slug, which still had its own separate published=true
-- filter, so that shortcut link 404'd for a draft even after 0080. Same fix,
-- second place it was needed: drop the published check here too. Suspended
-- orgs stay blocked regardless — that's a moderation concern, not a
-- draft/publish one.
create or replace function public.public_event_by_slug(p_slug text)
returns table (event_id uuid, org_slug text)
language sql
security definer
set search_path = public
stable
as $$
  select e.id as event_id, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(e.slug) = lower(p_slug)
    and o.is_suspended = false
  limit 1;
$$;
