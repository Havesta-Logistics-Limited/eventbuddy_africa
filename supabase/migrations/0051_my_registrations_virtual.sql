-- my_registrations() (0050) only ever queried `registrations`, which only physical
-- events write to — a virtual event's self-service registration writes a `leads` row
-- instead (see /api/orgs/[slug]/register's virtual branch), so those never showed up
-- in the mobile app's "My Tickets". This replaces it with a union of both, discriminated
-- by `kind` so the client can render a virtual entry differently (no QR/reference_id —
-- those don't exist for a lead row, just Hub access).
--
-- Matching a lead to "this is a self-service virtual registration, not a staff-collected
-- one" by event_format = 'virtual': staff/rep lead collection (the /collect booth panel,
-- 0014_lead_registration_link.sql) is a physical-event, at-the-booth concept — a virtual
-- event's leads are, by construction of the existing registration route, always the
-- attendee's own self-registration.
drop function if exists public.my_registrations();

create or replace function public.my_registrations()
returns table (
  id uuid,
  kind text,
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
    r.id, 'ticket' as kind, r.reference_id, r.full_name, r.email, r.status, r.checked_in_at, r.created_at,
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

  union all

  select
    l.id, 'virtual' as kind, null as reference_id, (l.first_name || ' ' || l.last_name) as full_name, l.email,
    'registered' as status, null as checked_in_at, l.created_at,
    e.id as event_id, e.name as event_name, e.date as event_date, e.end_date as event_end_date,
    e.start_time as event_start_time, e.location as event_location, e.venue as event_venue,
    e.event_format as event_format, e.cover_image,
    o.name as org_name, o.slug as org_slug,
    null::uuid as ticket_type_id, null as ticket_type_name
  from public.leads l
  join public.events e on e.id = l.event_id
  join public.organizations o on o.id = l.organization_id
  where auth.role() = 'authenticated'
    and e.event_format = 'virtual'
    and lower(l.email) = lower(coalesce(auth.jwt() ->> 'email', ''))

  order by created_at desc
  limit 200;
$$;

grant execute on function public.my_registrations() to authenticated;
