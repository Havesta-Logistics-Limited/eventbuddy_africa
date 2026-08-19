-- Event templates: lets an event be created from a template other than the built-in
-- Education Fair one (destinations/universities), with an admin-customizable set of
-- lead-capture fields instead. Templates themselves are code-defined (src/lib/event-templates.ts),
-- not stored in the DB — this migration only adds the columns needed to record which
-- template an event uses and what its custom fields/answers are.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.events
  add column if not exists template_id text not null default 'education-fair',
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;

-- Non-Education-Fair events have no destination/university, so leads for them can't
-- satisfy the old NOT NULL constraints. Existing Education Fair leads are unaffected.
alter table public.leads
  add column if not exists custom_answers jsonb not null default '{}'::jsonb,
  alter column destination_id drop not null,
  alter column university_id drop not null;

-- public_org_events (0002_slug_and_defaults.sql) needs to surface template_id so the
-- check-in flow knows whether to show the destination/school steps. Its RETURNS TABLE
-- shape is changing, which CREATE OR REPLACE can't do — drop and recreate instead.
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
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date);
$$;

grant execute on function public.public_org_events(text) to anon, authenticated;
