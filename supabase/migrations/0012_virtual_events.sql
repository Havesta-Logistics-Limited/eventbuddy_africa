-- Virtual events: an event can be hosted online (a join link an admin pastes in, e.g.
-- Zoom/Google Meet/Teams/YouTube Live) instead of at a physical venue. EventPal doesn't
-- host video itself — event_format just tells the rest of the app which set of
-- location fields to show. All columns are additive/nullable-or-defaulted, so every
-- existing event keeps working unmodified as 'physical' with no join info.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.events
  add column if not exists event_format text not null default 'physical' check (event_format in ('physical', 'virtual')),
  add column if not exists virtual_join_url text,
  add column if not exists virtual_platform text,
  add column if not exists virtual_access_notes text;

-- public_org_events's RETURNS TABLE shape is changing (new virtual-event columns, plus
-- timezone/capture_override so the public registration page can show an accurate
-- open/closed state before the attendee submits) — CREATE OR REPLACE can't do that,
-- so drop and recreate as 0008_event_templates.sql did for the same reason.
drop function if exists public.public_org_events(text);

create function public.public_org_events(org_slug text)
returns table (
  id uuid,
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
  event_format text,
  virtual_join_url text,
  virtual_platform text,
  virtual_access_notes text,
  timezone text,
  capture_override text,
  has_staff_code boolean,
  has_rep_code boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id,
    e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date);
$$;

grant execute on function public.public_org_events(text) to anon, authenticated;
