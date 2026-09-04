-- 1-on-1 speaker slot booking — a second, independent attendee-acquisition-adjacent
-- feature layered on top of the existing Event Hub speaker roster (event_speakers,
-- 0034-era). The organizer defines real bookable time slots per speaker; an attendee
-- who has just registered can claim one open slot each. There's no algorithmic
-- matching here — "the organizer manages the matching" by curating which slots exist
-- for which speaker; booking is simple first-come-first-served claiming of an
-- organizer-defined slot, enforced atomically by the unique index on booking.slot_id
-- below (a second booking attempt on an already-claimed slot hits 23505, exactly the
-- same race-safe pattern as ticket_types/discount_codes elsewhere in this app).
--
-- Independent of self_registration_enabled/is_invite_only — this is a step that can
-- follow either normal path, gated by its own explicit toggle so an event with
-- speakers who don't do 1-on-1s never shows an empty booking screen.

alter table public.events add column if not exists one_on_one_enabled boolean not null default false;

create table if not exists public.event_speaker_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  speaker_id uuid not null references public.event_speakers (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table public.event_speaker_slots alter column organization_id set default public.current_organization_id();

create index if not exists event_speaker_slots_event_id_idx on public.event_speaker_slots (event_id);
create index if not exists event_speaker_slots_speaker_id_idx on public.event_speaker_slots (speaker_id);
create index if not exists event_speaker_slots_organization_id_idx on public.event_speaker_slots (organization_id);

alter table public.event_speaker_slots enable row level security;

create policy "event_speaker_slots_all_own_org" on public.event_speaker_slots
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));

create policy "event_speaker_slots_select_platform_admin" on public.event_speaker_slots
  for select using (public.is_platform_admin());

create table if not exists public.event_speaker_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  slot_id uuid not null references public.event_speaker_slots (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.event_speaker_bookings alter column organization_id set default public.current_organization_id();

-- The actual capacity=1-per-slot enforcement: a second insert against an already-
-- booked slot_id hits this unique index, not application logic.
create unique index if not exists event_speaker_bookings_slot_id_key on public.event_speaker_bookings (slot_id);
create index if not exists event_speaker_bookings_event_id_idx on public.event_speaker_bookings (event_id);
create index if not exists event_speaker_bookings_organization_id_idx on public.event_speaker_bookings (organization_id);

alter table public.event_speaker_bookings enable row level security;

create policy "event_speaker_bookings_all_own_org" on public.event_speaker_bookings
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));

create policy "event_speaker_bookings_select_platform_admin" on public.event_speaker_bookings
  for select using (public.is_platform_admin());

-- Public read of open slots for the post-registration booking step, and the booking
-- write itself, both go through service-role API routes (never a direct anon RLS
-- policy) — same trust model as hub_token and event_guests.invite_token: the route
-- itself validates the event is published and one_on_one_enabled before touching
-- anything, and never exposes who booked an already-taken slot to the public reader.
