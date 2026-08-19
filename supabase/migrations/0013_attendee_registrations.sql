-- Self-service attendee registration: a public event link lets an attendee register
-- themselves (no staff session), producing a unique reference ID + QR code. Deliberately
-- a separate table from leads — a lead is captured by a logged-in staff member on-site;
-- a registration is self-service and happens (for physical events) before that, or (for
-- virtual events) is the attendance record itself. Staff can later scan/enter the
-- reference ID at /checkin to mark a registration checked_in.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  reference_id text not null,
  full_name text not null,
  email text not null,
  phone text,
  custom_answers jsonb not null default '{}'::jsonb,
  status text not null default 'registered' check (status in ('registered', 'checked_in', 'cancelled')),
  checked_in_at timestamptz,
  checked_in_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists registrations_reference_id_key on public.registrations (reference_id);
create index if not exists registrations_event_id_idx on public.registrations (event_id);
create index if not exists registrations_organization_id_idx on public.registrations (organization_id);

alter table public.registrations enable row level security;

-- Same reusable pattern as every other org-scoped table (0001_init.sql): full access
-- within your own org, read-only across every org if you're a platform admin. No public
-- policy — self-service registration and staff check-in both go through the
-- service-role client in a Route Handler, which is the trust boundary (mirrors leads/staff).
create policy "registrations_all_own_org" on public.registrations
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "registrations_select_platform_admin" on public.registrations
  for select using (public.is_platform_admin());
