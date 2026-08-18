-- UniLink multi-tenant schema — Phase 1 (Supabase, multi-tenancy, real admin auth)
--
-- Paste this into the Supabase SQL editor (Project → SQL Editor → New query) and run it once.
-- Mirrors the shapes in src/lib/types.ts, each scoped by organization_id.
--
-- Note: the app's day-to-day event/lead/staff data still reads/writes localStorage until
-- Phase 2 rewires src/lib/store.ts to use these tables. This migration only wires up real
-- signup/login (organizations + platform_admins) for now — the rest of the schema is created
-- ahead of time so Phase 2 doesn't need a second migration pass.

create extension if not exists "pgcrypto";

-- ---- organizations (tenants) ----

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists organizations_owner_user_id_key on public.organizations (owner_user_id);

-- ---- platform_admins ----
-- Business owner(s) who can see and manage every organization. Not signed up through
-- the public /signup flow — add rows manually via the Supabase dashboard's Table Editor.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---- destinations ----

create table if not exists public.destinations (
  id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  flag text not null
);

create index if not exists destinations_organization_id_idx on public.destinations (organization_id);

-- ---- universities ----

create table if not exists public.universities (
  id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  destination_id text not null references public.destinations (id) on delete cascade,
  name text not null,
  short_name text not null
);

create index if not exists universities_organization_id_idx on public.universities (organization_id);
create index if not exists universities_destination_id_idx on public.universities (destination_id);

-- ---- events ----

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  date date not null,
  end_date date,
  start_time time,
  end_time time,
  location text not null,
  venue text not null,
  destination_ids text[] not null default '{}',
  description text not null default '',
  cover_image text,
  staff_access_code text,
  rep_access_code text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  paystack_reference text,
  created_at timestamptz not null default now()
);

create index if not exists events_organization_id_idx on public.events (organization_id);

-- ---- staff (staff + rep accounts; admin identity lives in organizations.owner_user_id) ----

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text,
  role text not null check (role in ('staff', 'rep')),
  destination_id text references public.destinations (id) on delete set null,
  university_id text references public.universities (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  is_online boolean not null default false
);

create index if not exists staff_organization_id_idx on public.staff (organization_id);
create index if not exists staff_event_id_idx on public.staff (event_id);

-- ---- leads ----

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  destination_id text not null references public.destinations (id) on delete cascade,
  university_id text not null references public.universities (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete set null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text not null,
  phone text not null,
  preferred_course text not null,
  level_of_interest text not null default '',
  start_year text not null,
  highest_education text not null default '',
  taken_ielts text not null default '',
  comments text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists leads_organization_id_idx on public.leads (organization_id);
create index if not exists leads_event_id_idx on public.leads (event_id);

-- ---- row level security ----
-- Every org-scoped table: the caller can read/write rows in their own organization
-- (organizations.owner_user_id = auth.uid()), or read (never write another org's data by
-- default) if they're a platform admin — used by the /platform dashboard in Phase 5.

alter table public.organizations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.destinations enable row level security;
alter table public.universities enable row level security;
alter table public.events enable row level security;
alter table public.staff enable row level security;
alter table public.leads enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.owned_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.organizations where owner_user_id = auth.uid();
$$;

-- organizations: owner can read/update their own row; platform admins can read all.
create policy "organizations_select_own_or_platform_admin" on public.organizations
  for select using (owner_user_id = auth.uid() or public.is_platform_admin());
create policy "organizations_update_own" on public.organizations
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "organizations_insert_own" on public.organizations
  for insert with check (owner_user_id = auth.uid());

-- platform_admins: only platform admins can read the list; no client-side writes
-- (rows are added manually via the Supabase dashboard).
create policy "platform_admins_select" on public.platform_admins
  for select using (public.is_platform_admin());

-- Reusable pattern for the org-scoped tables below: full access within your own org,
-- read-only access across every org if you're a platform admin.
create policy "destinations_all_own_org" on public.destinations
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "destinations_select_platform_admin" on public.destinations
  for select using (public.is_platform_admin());

create policy "universities_all_own_org" on public.universities
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "universities_select_platform_admin" on public.universities
  for select using (public.is_platform_admin());

create policy "events_all_own_org" on public.events
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "events_select_platform_admin" on public.events
  for select using (public.is_platform_admin());

create policy "staff_all_own_org" on public.staff
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "staff_select_platform_admin" on public.staff
  for select using (public.is_platform_admin());

create policy "leads_all_own_org" on public.leads
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "leads_select_platform_admin" on public.leads
  for select using (public.is_platform_admin());

-- Staff/rep check-in (src/lib/store.ts's loginAsStaff/loginAsRep) is a lightweight,
-- no-password device session — it is NOT a Supabase Auth session, so auth.uid() is null
-- for those requests and the policies above don't grant it access. Those operations run
-- through server-side Route Handlers using the service-role client (src/lib/supabase/admin.ts),
-- which bypasses RLS entirely; the Route Handler itself is responsible for validating the
-- event/access-code before touching the database. See Phase 2/3 of the implementation plan.
