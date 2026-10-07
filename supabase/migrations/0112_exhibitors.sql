-- Exhibitors, phase 1 (2026-10-07): companies apply for a stand at an event,
-- the organizer approves or declines, and approved exhibitors pay through
-- Paystack (held funds, the organizer's normal ticket fee).
--
-- An approved or paid application holds its stand, so a stand type can't be
-- over-allocated; a pending application doesn't hold anything.

alter table public.events
  add column if not exists exhibitors_enabled boolean not null default false,
  add column if not exists exhibitor_intro text,
  add column if not exists exhibitor_deadline date;

create table if not exists public.stand_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 1000),
  price_naira numeric(12, 2) not null check (price_naira >= 100 and price_naira <= 100000000),
  -- null = no limit
  quantity integer check (quantity is null or quantity between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists stand_types_event_idx on public.stand_types (event_id);

create table if not exists public.exhibitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  stand_type_id uuid references public.stand_types (id) on delete set null,
  company_name text not null check (length(trim(company_name)) between 1 and 160),
  contact_name text not null check (length(trim(contact_name)) between 1 and 120),
  email text not null check (length(email) <= 254),
  phone text,
  website text check (website is null or length(website) <= 300),
  category text check (category is null or length(category) <= 80),
  description text check (description is null or length(description) <= 2000),
  status text not null default 'applied' check (status in ('applied', 'approved', 'declined', 'paid', 'cancelled')),
  -- the organizer's stand number, e.g. "A3"
  stand_label text check (stand_label is null or length(stand_label) <= 20),
  amount_naira numeric(12, 2),
  decline_reason text check (decline_reason is null or length(decline_reason) <= 500),
  -- secret in the exhibitor's payment link
  pay_token uuid not null default gen_random_uuid() unique,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  paid_at timestamptz
);
create index if not exists exhibitors_event_idx on public.exhibitors (event_id, applied_at desc);

alter table public.stand_types enable row level security;
alter table public.exhibitors enable row level security;

drop policy if exists "stand_types_all_own_org" on public.stand_types;
create policy "stand_types_all_own_org" on public.stand_types
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
drop policy if exists "stand_types_select_platform_admin" on public.stand_types;
create policy "stand_types_select_platform_admin" on public.stand_types for select using (public.is_platform_admin());

-- Organizers read their exhibitors and edit the stand number; decisions and
-- payments go through eventbuddy's routes (emails, availability checks).
drop policy if exists "exhibitors_select_own_org" on public.exhibitors;
create policy "exhibitors_select_own_org" on public.exhibitors
  for select using (organization_id in (select public.owned_organization_ids()));
drop policy if exists "exhibitors_update_own_org" on public.exhibitors;
create policy "exhibitors_update_own_org" on public.exhibitors
  for update using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
drop policy if exists "exhibitors_select_platform_admin" on public.exhibitors;
create policy "exhibitors_select_platform_admin" on public.exhibitors for select using (public.is_platform_admin());

-- From the browser an organizer may only change the stand number.
create or replace function public.protect_exhibitor_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := new.stand_label;
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new := old;
    new.stand_label := nullif(trim(v_label), '');
  end if;
  return new;
end;
$$;
drop trigger if exists exhibitors_protect_columns on public.exhibitors;
create trigger exhibitors_protect_columns before update on public.exhibitors
  for each row execute function public.protect_exhibitor_columns();

-- Stands left per type: quantity minus approved and paid applications.
create or replace function public.stand_availability(p_event_id uuid)
returns table (id uuid, name text, description text, price_naira numeric, quantity integer, taken integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.description, s.price_naira, s.quantity,
         (select count(*)::integer from public.exhibitors x where x.stand_type_id = s.id and x.status in ('approved', 'paid'))
  from public.stand_types s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event_id and e.published and e.exhibitors_enabled
  order by s.price_naira, s.created_at;
$$;
grant execute on function public.stand_availability(uuid) to anon, authenticated;

-- Stand payments are recorded like ticket payments.
alter table public.paystack_transactions add column if not exists exhibitor_id uuid references public.exhibitors (id) on delete set null;
alter table public.paystack_transactions drop constraint if exists paystack_transactions_purpose_check;
alter table public.paystack_transactions add constraint paystack_transactions_purpose_check
  check (purpose in ('event_publish', 'ticket_purchase', 'subscription', 'stand_booking'));
