-- Phase 2: org slug (for /[orgSlug]/staff-setup and /[orgSlug]/rep-login) + auto-filled
-- organization_id on admin inserts, so the browser client never needs to pass it manually.
--
-- Run this in the Supabase SQL Editor (or via psql, same as 0001_init.sql) after 0001_init.sql.

-- ---- organizations.slug ----

alter table public.organizations add column if not exists slug text;
create unique index if not exists organizations_slug_key on public.organizations (lower(slug));

-- ---- auto-fill organization_id for the signed-in admin's own inserts ----
-- Only meaningful for the browser client (a real Supabase Auth session). Service-role
-- Route Handlers (staff/rep check-in, lead submission) have no auth.uid() and always pass
-- organization_id explicitly, resolved from the event/org they're operating on.

create or replace function public.current_organization_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.organizations where owner_user_id = auth.uid();
$$;

alter table public.destinations alter column organization_id set default public.current_organization_id();
alter table public.universities alter column organization_id set default public.current_organization_id();
alter table public.events alter column organization_id set default public.current_organization_id();
alter table public.staff alter column organization_id set default public.current_organization_id();
alter table public.leads alter column organization_id set default public.current_organization_id();

-- ---- public, safe-columns-only event listing for the org-scoped check-in picker ----
-- Deliberately excludes staff_access_code / rep_access_code — those are validated
-- server-side in the staff-checkin/rep-checkin Route Handlers, never sent to the browser.
-- SECURITY DEFINER so it can read across RLS for an org resolved purely by public slug,
-- without granting the anon role any direct table access.

create or replace function public.public_org_events(org_slug text)
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
    e.destination_ids, e.description, e.cover_image, e.payment_status,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date);
$$;

grant execute on function public.public_org_events(text) to anon, authenticated;

-- ---- public org display info by slug ----
-- organizations itself is RLS-locked to its owner, so the check-in picker (no session at
-- all) needs this narrow, name/slug-only lookup instead of querying the table directly.

create or replace function public.public_org_by_slug(org_slug text)
returns table (id uuid, name text, slug text)
language sql
security definer
set search_path = public
stable
as $$
  select id, name, slug from public.organizations where lower(slug) = lower(org_slug);
$$;

grant execute on function public.public_org_by_slug(text) to anon, authenticated;

-- ---- public destinations/universities for the check-in form's later steps ----
-- Only non-sensitive display fields — no access codes involved here.

create or replace function public.public_org_destinations(org_slug text)
returns table (id text, name text, flag text)
language sql
security definer
set search_path = public
stable
as $$
  select d.id, d.name, d.flag
  from public.destinations d
  join public.organizations o on o.id = d.organization_id
  where lower(o.slug) = lower(org_slug);
$$;

grant execute on function public.public_org_destinations(text) to anon, authenticated;

create or replace function public.public_org_universities(org_slug text)
returns table (id text, destination_id text, name text, short_name text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.destination_id, u.name, u.short_name
  from public.universities u
  join public.organizations o on o.id = u.organization_id
  where lower(o.slug) = lower(org_slug);
$$;

grant execute on function public.public_org_universities(text) to anon, authenticated;

-- ---- public staff-name list for the "who are you?" convenience picker ----
-- Names only, role='staff' only — never exposes rep rows or any destination/
-- university/event association.

create or replace function public.public_org_staff_names(org_slug text)
returns table (id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.name
  from public.staff s
  join public.organizations o on o.id = s.organization_id
  where lower(o.slug) = lower(org_slug) and s.role = 'staff';
$$;

grant execute on function public.public_org_staff_names(text) to anon, authenticated;
