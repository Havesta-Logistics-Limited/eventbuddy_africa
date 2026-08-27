-- RSVP: a third attendee-acquisition mode alongside open self-registration and
-- staff-only booth capture, for private/corporate events with a known guest list.
-- Deliberately additive rather than replacing self_registration_enabled — that
-- column keeps meaning exactly what it always meant (does the public /register
-- link work); is_invite_only is a new, independent flag read only by the new
-- guest-list code paths below, so every existing call site is untouched.
--
-- A guest who accepts becomes a real `registrations` row (or `leads`, for a
-- virtual event) — the exact same row self-service registration creates — so
-- check-in, QR badges, the Event Hub, and CSV export all work unchanged with
-- zero new code. RSVP is just a different front door onto the same pipeline.

alter table public.events add column if not exists is_invite_only boolean not null default false;

create table if not exists public.event_guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  -- How many additional guests this invite covers, set by the organizer; the
  -- named guest reports how many they're actually bringing at RSVP time — v1
  -- tracks that as a headcount only, not individually named/checked-in guests.
  plus_ones_allowed integer not null default 0 check (plus_ones_allowed >= 0),
  plus_ones_confirmed integer check (plus_ones_confirmed is null or plus_ones_confirmed >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'maybe')),
  invite_token uuid not null default gen_random_uuid(),
  -- Set once the guest accepts — the real registrations/leads row this invite
  -- became, so the organizer can jump straight from a guest to their check-in
  -- record. Nullable and set-null on delete since a registration can be
  -- independently removed without invalidating the guest's RSVP history.
  registration_id uuid references public.registrations (id) on delete set null,
  invited_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.event_guests alter column organization_id set default public.current_organization_id();

create unique index if not exists event_guests_invite_token_idx on public.event_guests (invite_token);
create index if not exists event_guests_event_id_idx on public.event_guests (event_id);
create index if not exists event_guests_organization_id_idx on public.event_guests (organization_id);

alter table public.event_guests enable row level security;

-- Same shape as every other event-hub-era table: org-admin full CRUD, platform-
-- admin read-only for support visibility, no anon policy at all — the public
-- RSVP response flow goes through a service-role API route that treats the
-- unguessable invite_token as its own trust boundary, exactly like hub_token.
create policy "event_guests_all_own_org" on public.event_guests
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));

create policy "event_guests_select_platform_admin" on public.event_guests
  for select using (public.is_platform_admin());
