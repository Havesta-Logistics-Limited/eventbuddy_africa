-- Two changes, bundled since both touch the same public event-reading surface:
--
-- 1. `category` — a genuine organizer-set public label ("Conference", "Networking",
--    etc.), shown as a badge on the register page. Deliberately separate from
--    template_id, which drives internal structure (dashboard tabs, default custom
--    fields) and is never fit to show attendees — its "custom" template literally
--    reads "Custom / Blank", which is what this replaces on the public badge row.
--
-- 2. Event slugs (0055) become globally unique instead of per-organization, so a
--    slug alone — with no org segment — is enough to resolve an event. This is what
--    lets /discover/[slug] work as the new universal public link format
--    (eventbuddy.africa/discover/my-event-name) instead of the older
--    /[orgSlug]/events/[eventId]/register form (which still works for any event that
--    predates this or has no slug set). No existing data conflict: the only slug
--    ever set so far was a test value, already cleared before this ran.

alter table public.events add column if not exists category text;

drop index if exists events_org_slug_key;

create unique index if not exists events_slug_key
  on public.events (lower(slug))
  where slug is not null;

-- Resolves a bare event slug to its organization — the one piece of information
-- /discover/[slug] needs before it can reuse the existing org-scoped read routes
-- (/api/orgs/[slug]/events, etc.) for everything else.
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
    and e.published = true
    and o.is_suspended = false
  limit 1;
$$;

grant execute on function public.public_event_by_slug(text) to anon, authenticated;

drop function if exists public.public_org_events(text);

create function public.public_org_events(org_slug text)
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
  destination_ids text[],
  description text,
  cover_image text,
  payment_status text,
  template_id text,
  category text,
  custom_fields jsonb,
  event_format text,
  virtual_join_url text,
  virtual_platform text,
  virtual_access_notes text,
  timezone text,
  capture_override text,
  allow_rep_access boolean,
  self_registration_enabled boolean,
  has_staff_code boolean,
  has_rep_code boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
    and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date);
$$;

grant execute on function public.public_org_events(text) to anon, authenticated;

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
    o.name as org_name, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
    and coalesce(e.self_registration_enabled, true) = true
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
