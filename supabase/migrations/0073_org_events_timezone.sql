-- Adds timezone to the org public-page events RPC — needed to correctly tell
-- "upcoming" from "happening now" from "past" (a multi-day event can be past its
-- start date but still ongoing right now), the same getEventStatus() logic
-- already used on the register page and dashboard.
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
  category text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.timezone, e.location, e.venue,
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
