-- A per-organizer public page at /[orgSlug] — organization name, an optional
-- short bio the organizer writes themselves, and every published, publicly
-- reachable event they've ever run (upcoming and past, client buckets by date).

alter table public.organizations add column if not exists bio text;

create or replace function public.public_organization_profile(org_slug text)
returns table (id uuid, name text, slug text, bio text, is_verified boolean)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.name, o.slug, o.bio, o.is_verified
  from public.organizations o
  where lower(o.slug) = lower(org_slug)
    and o.is_suspended = false;
$$;

grant execute on function public.public_organization_profile(text) to anon, authenticated;

-- Same visibility rule as public_discover_events (published, not suspended, not
-- invite-only, self-registration on) but scoped to one org and NOT restricted to
-- still-open events — a profile page reasonably shows what an organizer has run
-- in the past too, not just what's still open for registration.
create or replace function public.public_organization_events(org_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  date date,
  end_date date,
  start_time time,
  end_time time,
  location text,
  venue text,
  description text,
  cover_image text,
  event_format text,
  virtual_platform text,
  category text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.description, e.cover_image, e.event_format, e.virtual_platform, e.category
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
    and coalesce(e.self_registration_enabled, true) = true
  order by e.date desc
  limit 200;
$$;

grant execute on function public.public_organization_events(text) to anon, authenticated;
