-- Invited teammate accounts: "admin" (identical access to the org owner) and
-- "event_support" (full dashboard access, scoped to exactly one event). See
-- src/lib/org-access.ts and finishAdminLogin (store.ts) for how a session
-- resolves into one of these.

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  role text not null check (role in ('admin', 'event_support')),
  event_id uuid references public.events (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (role <> 'event_support' or event_id is not null)
);

create unique index if not exists organization_members_org_email_key on public.organization_members (organization_id, lower(email));
create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists organization_members_event_id_idx on public.organization_members (event_id);

alter table public.organization_members enable row level security;

-- A member must be able to look up their own row (by user_id) to resolve their
-- role/event at login, before owned_organization_ids() (below) would ever apply
-- to them.
create policy "organization_members_select_self" on public.organization_members
  for select using (user_id = auth.uid());

-- Owner and admin members manage the team the same way (owned_organization_ids()
-- covers both, see below) — invite, change role, remove.
create policy "organization_members_all_own_org" on public.organization_members
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));

create policy "organization_members_select_platform_admin" on public.organization_members
  for select using (public.is_platform_admin());

-- ---- RLS helpers ----

-- Extended, not replaced: an active admin member now gets every access path the
-- owner already has, with zero changes to any existing policy anywhere in the
-- schema — this single function is the entire admin-member grant.
create or replace function public.owned_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.organizations where owner_user_id = auth.uid()
  union
  select organization_id from public.organization_members
  where user_id = auth.uid() and role = 'admin' and status = 'active';
$$;

-- Owner/admin -> every event in their orgs (unchanged access, just expressed as
-- event ids). An active event_support member -> only their one assigned event.
-- Used purely to ADD an access path for event_support on event-scoped tables —
-- every existing organization_id-scoped policy is untouched.
create or replace function public.accessible_event_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.events where organization_id in (select public.owned_organization_ids())
  union
  select event_id from public.organization_members
  where user_id = auth.uid() and role = 'event_support' and status = 'active' and event_id is not null;
$$;

-- Any active member (either role) of an org, for read-only access to org-wide,
-- non-sensitive reference data (destinations/universities) that an event_support
-- member needs to display but shouldn't need per-event scoping for.
create or replace function public.member_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id from public.organization_members
  where user_id = auth.uid() and status = 'active';
$$;

-- ---- events: event_support gets read + edit on just their one event ----

create policy "events_select_event_support" on public.events
  for select using (id in (select public.accessible_event_ids()));

create policy "events_update_event_support" on public.events
  for update using (id in (select public.accessible_event_ids()))
  with check (id in (select public.accessible_event_ids()));

-- ---- reference data: read-only for any active member ----

create policy "destinations_select_member" on public.destinations
  for select using (organization_id in (select public.member_organization_ids()));

create policy "universities_select_member" on public.universities
  for select using (organization_id in (select public.member_organization_ids()));

-- ---- event-scoped tables: additive full access for event_support ----

create policy "registrations_all_event_support" on public.registrations
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "leads_all_event_support" on public.leads
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "staff_all_event_support" on public.staff
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "ticket_types_all_event_support" on public.ticket_types
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "discount_codes_all_event_support" on public.discount_codes
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_sessions_all_event_support" on public.event_sessions
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_speakers_all_event_support" on public.event_speakers
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_session_speakers_all_event_support" on public.event_session_speakers
  for all using (session_id in (select id from public.event_sessions where event_id in (select public.accessible_event_ids())))
  with check (session_id in (select id from public.event_sessions where event_id in (select public.accessible_event_ids())));

create policy "event_hub_members_all_event_support" on public.event_hub_members
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_questions_all_event_support" on public.event_questions
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_question_upvotes_select_event_support" on public.event_question_upvotes
  for select using (question_id in (select id from public.event_questions where event_id in (select public.accessible_event_ids())));

create policy "event_announcements_all_event_support" on public.event_announcements
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_polls_all_event_support" on public.event_polls
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_poll_options_all_event_support" on public.event_poll_options
  for all using (poll_id in (select id from public.event_polls where event_id in (select public.accessible_event_ids())))
  with check (poll_id in (select id from public.event_polls where event_id in (select public.accessible_event_ids())));

create policy "event_poll_votes_select_event_support" on public.event_poll_votes
  for select using (poll_id in (select id from public.event_polls where event_id in (select public.accessible_event_ids())));

create policy "event_guests_all_event_support" on public.event_guests
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "event_survey_responses_select_event_support" on public.event_survey_responses
  for select using (event_id in (select public.accessible_event_ids()));

create policy "event_one_on_one_requests_all_event_support" on public.event_one_on_one_requests
  for all using (event_id in (select public.accessible_event_ids()))
  with check (event_id in (select public.accessible_event_ids()));

create policy "registration_form_starts_select_event_support" on public.registration_form_starts
  for select using (event_id in (select public.accessible_event_ids()));
