-- Fast-follow engagement features for the Event Hub (0035_event_hub.sql):
-- upvoting on questions, live polls, and personal agenda bookmarking. All three
-- follow the same access model as the rest of the Hub — attendee actions go through
-- service-role API routes keyed by hub_token, never direct anon RLS.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

-- ---- question upvotes ----
-- event_questions.upvote_count (added in 0035) is kept in sync by the trigger below
-- rather than incremented/decremented from application code, so it can never drift
-- from the actual vote rows — the count is always exactly select count(*) from here.
create table if not exists public.event_question_upvotes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.event_questions (id) on delete cascade,
  hub_member_id uuid not null references public.event_hub_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, hub_member_id)
);
create index if not exists event_question_upvotes_question_id_idx on public.event_question_upvotes (question_id);
alter table public.event_question_upvotes enable row level security;
create policy "event_question_upvotes_select_own_org" on public.event_question_upvotes
  for select using (question_id in (
    select id from public.event_questions where organization_id in (select public.owned_organization_ids())
  ));
create policy "event_question_upvotes_select_platform_admin" on public.event_question_upvotes
  for select using (public.is_platform_admin());
-- No anon/write policy — upvoting goes through a service-role API route, same as
-- submitting a question.

create or replace function public.sync_question_upvote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_questions
  set upvote_count = (select count(*) from public.event_question_upvotes where question_id = coalesce(new.question_id, old.question_id))
  where id = coalesce(new.question_id, old.question_id);
  return null;
end;
$$;
drop trigger if exists event_question_upvotes_sync on public.event_question_upvotes;
create trigger event_question_upvotes_sync
  after insert or delete on public.event_question_upvotes
  for each row execute function public.sync_question_upvote_count();

-- ---- live polls ----
create table if not exists public.event_polls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  session_id uuid references public.event_sessions (id) on delete set null,
  question text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists event_polls_event_id_idx on public.event_polls (event_id);
alter table public.event_polls alter column organization_id set default public.current_organization_id();
alter table public.event_polls enable row level security;
create policy "event_polls_all_own_org" on public.event_polls
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_polls_select_platform_admin" on public.event_polls
  for select using (public.is_platform_admin());

create table if not exists public.event_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_polls (id) on delete cascade,
  label text not null,
  position integer not null default 0,
  vote_count integer not null default 0
);
create index if not exists event_poll_options_poll_id_idx on public.event_poll_options (poll_id);
alter table public.event_poll_options enable row level security;
create policy "event_poll_options_all_own_org" on public.event_poll_options
  for all using (poll_id in (
    select id from public.event_polls where organization_id in (select public.owned_organization_ids())
  ))
  with check (poll_id in (
    select id from public.event_polls where organization_id in (select public.owned_organization_ids())
  ));
create policy "event_poll_options_select_platform_admin" on public.event_poll_options
  for select using (public.is_platform_admin());

create table if not exists public.event_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_polls (id) on delete cascade,
  option_id uuid not null references public.event_poll_options (id) on delete cascade,
  hub_member_id uuid not null references public.event_hub_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, hub_member_id)
);
create index if not exists event_poll_votes_poll_id_idx on public.event_poll_votes (poll_id);
alter table public.event_poll_votes enable row level security;
create policy "event_poll_votes_select_own_org" on public.event_poll_votes
  for select using (poll_id in (
    select id from public.event_polls where organization_id in (select public.owned_organization_ids())
  ));
create policy "event_poll_votes_select_platform_admin" on public.event_poll_votes
  for select using (public.is_platform_admin());
-- No anon/write policy — voting goes through a service-role API route.

create or replace function public.sync_poll_option_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_poll_options
  set vote_count = (select count(*) from public.event_poll_votes where option_id = coalesce(new.option_id, old.option_id))
  where id = coalesce(new.option_id, old.option_id);
  return null;
end;
$$;
drop trigger if exists event_poll_votes_sync on public.event_poll_votes;
create trigger event_poll_votes_sync
  after insert or delete on public.event_poll_votes
  for each row execute function public.sync_poll_option_vote_count();

-- ---- personal agenda bookmarks ----
create table if not exists public.event_agenda_bookmarks (
  id uuid primary key default gen_random_uuid(),
  hub_member_id uuid not null references public.event_hub_members (id) on delete cascade,
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (hub_member_id, session_id)
);
create index if not exists event_agenda_bookmarks_hub_member_id_idx on public.event_agenda_bookmarks (hub_member_id);
alter table public.event_agenda_bookmarks enable row level security;
create policy "event_agenda_bookmarks_select_platform_admin" on public.event_agenda_bookmarks
  for select using (public.is_platform_admin());
-- No org-admin or anon policy needed — an attendee's personal agenda is only ever
-- read/written server-side via the service-role client, scoped by hub_token.
