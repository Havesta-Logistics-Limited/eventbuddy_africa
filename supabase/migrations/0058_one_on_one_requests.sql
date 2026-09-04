-- Replaces real speaker/time-slot booking (0056) with a plain interest request: the
-- attendee just says "yes, I'd like a 1-on-1" (with an optional note on what they
-- want to discuss), and the organizer manually assigns them afterward to whatever
-- actually makes sense — a booth, a room, a stand, a specific speaker. The app's job
-- is capturing the request and giving the organizer a place to track/assign it, not
-- picking a speaker or a slot up front.
--
-- event_speaker_slots/event_speaker_bookings (0056) are dropped outright rather than
-- migrated — that feature shipped only hours before this correction, with no real
-- data in either table.

drop table if exists public.event_speaker_bookings;
drop table if exists public.event_speaker_slots;

create table public.event_one_on_one_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  -- What the attendee said they want to discuss, if anything — optional, shown to
  -- the organizer alongside the request to help them decide the assignment.
  note text,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'done')),
  -- Free text the organizer fills in once they've decided — "Booth 12", "Room B",
  -- "Speaker: Dr. Adeyemi", whatever the event actually needs. Deliberately not a
  -- foreign key to anything; this is organizer judgment, not a system-picked slot.
  assignment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_one_on_one_requests alter column organization_id set default public.current_organization_id();

create index if not exists event_one_on_one_requests_event_id_idx on public.event_one_on_one_requests (event_id);
create index if not exists event_one_on_one_requests_organization_id_idx on public.event_one_on_one_requests (organization_id);

alter table public.event_one_on_one_requests enable row level security;

-- Same shape as every other event-hub-era table: org-admin full CRUD (so the
-- dashboard can edit status/assignment directly via the browser client, no API
-- route needed), platform-admin read-only for support visibility, no anon policy —
-- the public request-submission flow goes through a service-role API route instead,
-- exactly like /api/orgs/[slug]/register already does.
create policy "event_one_on_one_requests_all_own_org" on public.event_one_on_one_requests
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));

create policy "event_one_on_one_requests_select_platform_admin" on public.event_one_on_one_requests
  for select using (public.is_platform_admin());
