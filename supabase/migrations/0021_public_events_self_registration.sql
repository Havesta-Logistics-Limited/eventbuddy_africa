-- public_org_events (0017, 0019) needs to carry the new self_registration_enabled
-- column (0020) so the public /[orgSlug]/events/[eventId]/register page can tell
-- attendees registration isn't available for an event, instead of just showing a form
-- that silently gets rejected server-side.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once), after
-- 0020_self_registration_toggle.sql.

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
    e.id, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date);
$$;

grant execute on function public.public_org_events(text) to anon, authenticated;
