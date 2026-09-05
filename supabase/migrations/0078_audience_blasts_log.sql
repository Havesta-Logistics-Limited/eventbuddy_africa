-- A record of every blast sent from the Audience page — previously nothing
-- logged a send at all, so an organizer had no way to check what was sent,
-- when, to how many people, or whether it went to the whole audience or one
-- event's attendees.
create table if not exists public.audience_blasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sent_by uuid references auth.users (id) on delete set null,
  subject text not null,
  message_html text not null,
  cta_label text,
  cta_url text,
  target_event_id uuid references public.events (id) on delete set null,
  target_status text,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists audience_blasts_org_id_idx on public.audience_blasts (organization_id, created_at desc);

alter table public.audience_blasts enable row level security;

-- Same access shape as the blast-sending route itself (owner or an invited
-- "admin" member) — read-only here, the row is only ever written by the
-- service-role client from the blast route right after sending.
create policy "audience_blasts_select_own_org" on public.audience_blasts
  for select using (organization_id in (select public.owned_organization_ids()));
