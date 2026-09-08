-- A booth-only event (self_registration_enabled = false — leads captured
-- directly at the booth, no public sign-up) was completely invisible on both
-- Discover and the org's own public profile page, since both required
-- self-registration to be on. An organizer still wants a booth-only event
-- listed for promotion/awareness even though there's nothing to register
-- for online — this drops that requirement and exposes the flag instead, so
-- the frontend can show a "booth only" indicator instead of a price/CTA.
-- Registration itself is unaffected: the register page already shows a
-- graceful "captured at the door" message for these events (RegisterPageContent).
drop function if exists public.public_discover_events();

create function public.public_discover_events()
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
  category text,
  self_registration_enabled boolean,
  org_name text,
  org_slug text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.description, e.cover_image, e.event_format, e.virtual_platform, e.category,
    coalesce(e.self_registration_enabled, true) as self_registration_enabled,
    o.name as org_name, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
    and (
      e.capture_override = 'open'
      or (
        e.capture_override is distinct from 'closed'
        and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date)
      )
    )
  order by e.date asc
  limit 200;
$$;

grant execute on function public.public_discover_events() to anon, authenticated;

drop function if exists public.public_organization_events(text);

create function public.public_organization_events(org_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  date date,
  end_date date,
  start_time time,
  end_time time,
  timezone text,
  location text,
  venue text,
  description text,
  cover_image text,
  event_format text,
  virtual_platform text,
  category text,
  self_registration_enabled boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.timezone, e.location, e.venue,
    e.description, e.cover_image, e.event_format, e.virtual_platform, e.category,
    coalesce(e.self_registration_enabled, true) as self_registration_enabled
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
  order by e.date desc
  limit 200;
$$;

grant execute on function public.public_organization_events(text) to anon, authenticated;
