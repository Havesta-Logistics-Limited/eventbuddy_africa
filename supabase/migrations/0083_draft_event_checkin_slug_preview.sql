-- Same bug, third place it was needed: staff-setup and rep-login's per-event
-- pinned link (/staff-setup/<checkin-slug>, /rep-login/<checkin-slug>) also
-- reads from the published-only /events list, so a draft event's check-in
-- link showed "isn't valid anymore" even though the organizer just wants to
-- set up/test check-in before publishing. Adds checkin_slug matching and
-- real has_staff_code/has_rep_code (previously hardcoded false by the API
-- route for the fallback path, which would have skipped the access-code gate)
-- to the same public_event_by_ref used for the register-page preview.
drop function if exists public.public_event_by_ref(text, text);

create function public.public_event_by_ref(org_slug text, id_or_slug text)
returns table (
  id uuid,
  slug text,
  checkin_slug text,
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
    e.id, e.slug, e.checkin_slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled, e.published,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.id::text = id_or_slug or lower(e.slug) = lower(id_or_slug) or lower(e.checkin_slug) = lower(id_or_slug))
  limit 1;
$$;

grant execute on function public.public_event_by_ref(text, text) to anon, authenticated;
