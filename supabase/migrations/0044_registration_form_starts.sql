-- Captures a registration attempt as soon as a visitor enters a valid-looking
-- email (debounced, before they ever click submit), so organizers can see and
-- follow up with people who abandoned the form itself — not just the checkout
-- step, which paystack_transactions already covers via its "pending" status.
create table if not exists public.registration_form_starts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  ticket_type_id uuid references public.ticket_types (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, email)
);

create index if not exists registration_form_starts_event_id_idx on public.registration_form_starts (event_id);

alter table public.registration_form_starts enable row level security;

-- Read-only for the owning org (and platform admins) — writes only ever come
-- from the service-role client via the public capture route, same model as
-- paystack_transactions.
create policy registration_form_starts_select_own_org on public.registration_form_starts
  for select using (organization_id in (select public.owned_organization_ids()));

create policy registration_form_starts_select_platform_admin on public.registration_form_starts
  for select using (public.is_platform_admin());
