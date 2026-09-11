-- Splits events.checkin_slug into staff_checkin_slug and rep_checkin_slug.
-- It was one column shared verbatim by both the staff and rep check-in links
-- (CheckinLinksCard just appended it under /staff-setup/ or /rep-login/), which
-- also meant it could never become a short root-level link like the
-- registration link (eventbuddy.africa/{slug}, migration 0057) — a single
-- slug can't unambiguously mean "staff check-in" AND "rep check-in" at the
-- same bare URL. Two independent columns let each get its own short link.
-- Both start out holding the old shared value so every already-copied staff
-- or rep link keeps resolving unchanged; going forward each has its own
-- uniqueness domain and can be edited independently.
alter table public.events add column if not exists staff_checkin_slug text;
alter table public.events add column if not exists rep_checkin_slug text;

update public.events set staff_checkin_slug = checkin_slug where checkin_slug is not null and staff_checkin_slug is null;
update public.events set rep_checkin_slug = checkin_slug where checkin_slug is not null and rep_checkin_slug is null;

create unique index if not exists events_staff_checkin_slug_key on public.events (lower(staff_checkin_slug)) where staff_checkin_slug is not null;
create unique index if not exists events_rep_checkin_slug_key on public.events (lower(rep_checkin_slug)) where rep_checkin_slug is not null;

drop index if exists events_checkin_slug_key;
alter table public.events drop column if exists checkin_slug;

-- Resolves a short root-level staff/rep check-in slug to its event/org — same
-- shape as public_event_by_slug (migration 0057/0081), deliberately with no
-- published filter (only suspended orgs are excluded) since a draft event's
-- own check-in link must work too; staff-setup/rep-login already fall back to
-- the draft-preview endpoint once they know which event the slug points to.
create or replace function public.public_event_by_staff_checkin_slug(p_slug text)
returns table (event_id uuid, org_slug text)
language sql
security definer
set search_path = public
stable
as $$
  select e.id as event_id, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(e.staff_checkin_slug) = lower(p_slug)
    and o.is_suspended = false
  limit 1;
$$;

grant execute on function public.public_event_by_staff_checkin_slug(text) to anon, authenticated;

create or replace function public.public_event_by_rep_checkin_slug(p_slug text)
returns table (event_id uuid, org_slug text)
language sql
security definer
set search_path = public
stable
as $$
  select e.id as event_id, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(e.rep_checkin_slug) = lower(p_slug)
    and o.is_suspended = false
  limit 1;
$$;

grant execute on function public.public_event_by_rep_checkin_slug(text) to anon, authenticated;

-- public_org_events (read by /api/orgs/[slug]/events, which staff-setup/rep-login
-- use to match a pinned slug against the right column) — same shape as 0068's
-- version, checkin_slug replaced by the two new columns.
drop function if exists public.public_org_events(text);

create function public.public_org_events(org_slug text)
returns table (
  id uuid,
  slug text,
  staff_checkin_slug text,
  rep_checkin_slug text,
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
    e.id, e.slug, e.staff_checkin_slug, e.rep_checkin_slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
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

-- public_event_by_ref (draft-preview fallback, migration 0083) — same shape,
-- checkin_slug matching replaced by matching against either new column, since
-- this one RPC serves both the staff-setup and rep-login preview fallbacks.
drop function if exists public.public_event_by_ref(text, text);

create function public.public_event_by_ref(org_slug text, id_or_slug text)
returns table (
  id uuid,
  slug text,
  staff_checkin_slug text,
  rep_checkin_slug text,
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
  published boolean,
  has_staff_code boolean,
  has_rep_code boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.staff_checkin_slug, e.rep_checkin_slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled, e.published,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.id::text = id_or_slug or lower(e.slug) = lower(id_or_slug) or lower(e.staff_checkin_slug) = lower(id_or_slug) or lower(e.rep_checkin_slug) = lower(id_or_slug))
  limit 1;
$$;

grant execute on function public.public_event_by_ref(text, text) to anon, authenticated;
