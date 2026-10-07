-- Exhibitors, phase 2 (2026-10-07): the exhibitor portal.
--
-- A paid exhibitor gets a private portal link (exhibitors.portal_token). In it
-- they name their staff passes, up to the stand type's passes_included; each
-- pass is a registration on the event (source 'exhibitor'), so it gets a QR
-- ticket by email and is scanned at the door like any other ticket. Their
-- staff also scan attendees' tickets at the stand to collect leads.

alter table public.stand_types
  add column if not exists passes_included integer not null default 2;
alter table public.stand_types drop constraint if exists stand_types_passes_valid;
alter table public.stand_types add constraint stand_types_passes_valid check (passes_included between 0 and 50);

alter table public.exhibitors
  add column if not exists portal_token uuid not null default gen_random_uuid();
create unique index if not exists exhibitors_portal_token_key on public.exhibitors (portal_token);

-- staff passes
alter table public.registrations add column if not exists exhibitor_id uuid references public.exhibitors (id) on delete cascade;
create index if not exists registrations_exhibitor_idx on public.registrations (exhibitor_id) where exhibitor_id is not null;
alter table public.registrations drop constraint if exists registrations_source_check;
alter table public.registrations add constraint registrations_source_check
  check (source in ('web', 'mobile', 'kiosk', 'exhibitor'));

-- leads an exhibitor's staff collect by scanning attendees' tickets
create table if not exists public.exhibitor_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  exhibitor_id uuid not null references public.exhibitors (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  rating text check (rating is null or rating in ('hot', 'warm', 'cold')),
  notes text check (notes is null or length(notes) <= 2000),
  captured_by text check (captured_by is null or length(captured_by) <= 120),
  captured_at timestamptz not null default now(),
  unique (exhibitor_id, registration_id)
);
create index if not exists exhibitor_leads_exhibitor_idx on public.exhibitor_leads (exhibitor_id, captured_at desc);

alter table public.exhibitor_leads enable row level security;
-- the organizer sees how many leads each exhibitor collected; exhibitors use
-- the portal (server routes keyed by their portal link)
drop policy if exists "exhibitor_leads_select_own_org" on public.exhibitor_leads;
create policy "exhibitor_leads_select_own_org" on public.exhibitor_leads
  for select using (organization_id in (select public.owned_organization_ids()));
