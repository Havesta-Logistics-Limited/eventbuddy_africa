-- Per-event "Hub": schedule, speaker roster, moderated Q&A targetable at a session
-- or specific speaker, and organizer announcements — visible to anyone who
-- registered for that event (physical or virtual), reached via a link mailed at
-- registration time rather than a separate signup step.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

-- ---- schedule ----
create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  track text,
  session_type text not null default 'session' check (session_type in ('session', 'keynote', 'panel', 'break', 'networking')),
  qa_open boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists event_sessions_event_id_idx on public.event_sessions (event_id);
alter table public.event_sessions alter column organization_id set default public.current_organization_id();
alter table public.event_sessions enable row level security;
create policy "event_sessions_all_own_org" on public.event_sessions
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_sessions_select_platform_admin" on public.event_sessions
  for select using (public.is_platform_admin());

-- ---- speaker roster ----
create table if not exists public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  title text,
  company text,
  bio text,
  photo_url text,
  created_at timestamptz not null default now()
);
create index if not exists event_speakers_event_id_idx on public.event_speakers (event_id);
alter table public.event_speakers alter column organization_id set default public.current_organization_id();
alter table public.event_speakers enable row level security;
create policy "event_speakers_all_own_org" on public.event_speakers
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_speakers_select_platform_admin" on public.event_speakers
  for select using (public.is_platform_admin());

-- ---- which speaker is on which session, and in what capacity ----
create table if not exists public.event_session_speakers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  speaker_id uuid not null references public.event_speakers (id) on delete cascade,
  role text not null default 'speaker' check (role in ('speaker', 'moderator', 'panelist', 'keynote')),
  unique (session_id, speaker_id)
);
create index if not exists event_session_speakers_session_id_idx on public.event_session_speakers (session_id);
create index if not exists event_session_speakers_speaker_id_idx on public.event_session_speakers (speaker_id);
alter table public.event_session_speakers enable row level security;
create policy "event_session_speakers_all_own_org" on public.event_session_speakers
  for all using (session_id in (
    select id from public.event_sessions where organization_id in (select public.owned_organization_ids())
  ))
  with check (session_id in (
    select id from public.event_sessions where organization_id in (select public.owned_organization_ids())
  ));
create policy "event_session_speakers_select_platform_admin" on public.event_session_speakers
  for select using (public.is_platform_admin());

-- ---- who can access this event's Hub — unifies physical (registrations) and
-- virtual (leads) attendees under one access mechanism, since the Hub shouldn't
-- need to know which path someone registered through. Populated automatically by
-- the registration routes, never by the attendee directly. hub_token is mailed as
-- the access link — unguessable, same trust model as a registration reference_id.
create table if not exists public.event_hub_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  email text not null,
  full_name text not null,
  hub_token text not null unique,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);
create index if not exists event_hub_members_event_id_idx on public.event_hub_members (event_id);
create index if not exists event_hub_members_token_idx on public.event_hub_members (hub_token);
alter table public.event_hub_members enable row level security;
create policy "event_hub_members_all_own_org" on public.event_hub_members
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
-- Deliberately no public/anon policy at all — this table holds attendee PII and is
-- only ever read server-side via the service-role client during token verification.

-- ---- Q&A ----
create table if not exists public.event_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  session_id uuid references public.event_sessions (id) on delete set null,
  speaker_id uuid references public.event_speakers (id) on delete set null,
  asked_by_member_id uuid references public.event_hub_members (id) on delete set null,
  asked_by_name text not null,
  question_text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'answered', 'hidden')),
  upvote_count integer not null default 0,
  created_at timestamptz not null default now(),
  moderated_at timestamptz
);
create index if not exists event_questions_event_id_idx on public.event_questions (event_id);
create index if not exists event_questions_status_idx on public.event_questions (event_id, status);
alter table public.event_questions alter column organization_id set default public.current_organization_id();
alter table public.event_questions enable row level security;
create policy "event_questions_all_own_org" on public.event_questions
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_questions_select_platform_admin" on public.event_questions
  for select using (public.is_platform_admin());
-- No anon policy — attendee submission and the approved-questions list both go
-- through service-role API routes (src/app/api/orgs/[slug]/events/[eventId]/hub/*),
-- same trust model as /api/leads and /api/orgs/[slug]/register.

-- ---- organizer announcements ----
create table if not exists public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists event_announcements_event_id_idx on public.event_announcements (event_id);
alter table public.event_announcements alter column organization_id set default public.current_organization_id();
alter table public.event_announcements enable row level security;
create policy "event_announcements_all_own_org" on public.event_announcements
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_announcements_select_platform_admin" on public.event_announcements
  for select using (public.is_platform_admin());
