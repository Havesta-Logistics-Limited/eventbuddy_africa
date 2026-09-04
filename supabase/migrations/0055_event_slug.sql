-- Per-event custom registration link, mirroring organizations.slug (0002) exactly but
-- scoped to the owning organization instead of globally — two different orgs can both
-- use "career-fair" for an event's link, they just can't collide with each other or
-- with the same org's other events. Nullable: an event with no slug set keeps working
-- off its raw id (both public reads below return the id regardless), so nothing breaks
-- for the thousands of events created before this existed.
alter table public.events add column if not exists slug text;

create unique index if not exists events_org_slug_key
  on public.events (organization_id, lower(slug))
  where slug is not null;

-- Surface slug on both public reads that back /[orgSlug]/events/[eventId]/register and
-- /discover, so the frontend can build eventbuddy.africa/{org}/events/{custom-slug}/register
-- links and resolve either the real id or a custom slug back to the same event.

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
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id,
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
    e.description, e.cover_image, e.event_format, e.virtual_platform,
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
