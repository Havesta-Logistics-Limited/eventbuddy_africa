-- Recurring/series events — the wizard generates N real, independent event rows
-- up front (each with its own registrations/leads/tickets, exactly like any other
-- event), linked back to one lightweight series row purely for grouping/display.
-- Deliberately not a single "template + recurrence rule" model: every occurrence
-- needs to be independently editable (cancel one date without touching the rest,
-- vary capacity per date, etc.), which real rows give for free and a computed-
-- occurrence model would need much more machinery to support.

create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists event_series_organization_id_idx on public.event_series (organization_id);
alter table public.event_series enable row level security;
create policy "event_series_all_own_org" on public.event_series
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_series_select_platform_admin" on public.event_series
  for select using (public.is_platform_admin());

alter table public.events add column if not exists series_id uuid references public.event_series (id) on delete set null;
alter table public.events add column if not exists series_occurrence_index integer;
create index if not exists events_series_id_idx on public.events (series_id);
