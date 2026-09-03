-- Attendee accounts for the eventbuddy mobile app. Registration on the web stays fully
-- anonymous (name/email/phone, no login) — this migration doesn't touch that. It adds a
-- read surface so a *logged-in* attendee (a plain Supabase Auth user with no
-- organizations/staff row of their own — see src/app/api/attendee/signup/route.ts) can see
-- their own past registrations as "My Tickets", by matching the email already on file.
--
-- No new tables: registrations.email already exists, so this is the same
-- "expose via a SECURITY DEFINER RPC, never a raw table grant" pattern as every other
-- public/scoped read in this codebase (public_org_events, public_discover_events, etc.).
-- authenticated-only (not anon) since it depends on auth.jwt().
create or replace function public.my_registrations()
returns table (
  id uuid,
  reference_id text,
  full_name text,
  email text,
  status text,
  checked_in_at timestamptz,
  created_at timestamptz,
  event_id uuid,
  event_name text,
  event_date date,
  event_end_date date,
  event_start_time time,
  event_location text,
  event_venue text,
  event_format text,
  cover_image text,
  org_name text,
  org_slug text,
  ticket_type_id uuid,
  ticket_type_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id, r.reference_id, r.full_name, r.email, r.status, r.checked_in_at, r.created_at,
    e.id as event_id, e.name as event_name, e.date as event_date, e.end_date as event_end_date,
    e.start_time as event_start_time, e.location as event_location, e.venue as event_venue,
    e.event_format as event_format, e.cover_image,
    o.name as org_name, o.slug as org_slug,
    r.ticket_type_id, t.name as ticket_type_name
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  left join public.ticket_types t on t.id = r.ticket_type_id
  where auth.role() = 'authenticated'
    and lower(r.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by r.created_at desc
  limit 200;
$$;

grant execute on function public.my_registrations() to authenticated;
