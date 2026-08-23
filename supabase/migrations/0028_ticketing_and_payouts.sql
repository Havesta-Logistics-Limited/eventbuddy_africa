-- Paid ticketing with real Paystack split payments: an attendee's ticket payment is
-- split at the payment-gateway level between the organization's own bank account (via
-- a Paystack Subaccount) and eventbuddy's platform fee — eventbuddy never holds and
-- manually forwards an organizer's ticket revenue.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

-- ---- payout details (per organization) ----
alter table public.organizations
  add column if not exists paystack_subaccount_code text,
  add column if not exists payout_bank_code text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_account_number text,
  add column if not exists payout_account_name text;

-- ---- platform-wide ticket fee ----
-- The percentage eventbuddy keeps from every paid ticket sale (the rest settles
-- straight to the organizer's own bank account via their Paystack subaccount). Same
-- singleton-row pattern as event_price_usd — one source of truth, editable from the
-- platform admin's Billing tab.
alter table public.platform_settings
  add column if not exists ticket_fee_percentage numeric(5, 2) not null default 5.00;

-- ---- ticket_types ----
create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text,
  price_usd numeric(10, 2) not null default 0 check (price_usd >= 0),
  quantity_available integer check (quantity_available is null or quantity_available >= 0),
  quantity_sold integer not null default 0,
  sales_start timestamptz,
  sales_end timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ticket_types_event_id_idx on public.ticket_types (event_id);
create index if not exists ticket_types_organization_id_idx on public.ticket_types (organization_id);

-- Same auto-fill as every other admin-owned table (see 0002_slug_and_defaults.sql) —
-- the browser client's insert never sends organization_id itself.
alter table public.ticket_types alter column organization_id set default public.current_organization_id();

alter table public.ticket_types enable row level security;

create policy "ticket_types_all_own_org" on public.ticket_types
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "ticket_types_select_platform_admin" on public.ticket_types
  for select using (public.is_platform_admin());

-- Public, read-only, published-events-only — mirrors public_org_events (0025) exactly,
-- so the public registration page can show ticket options without exposing anything
-- about unpublished/draft events or other organizations' tickets.
create or replace function public.public_event_ticket_types(p_event_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  price_usd numeric,
  quantity_available integer,
  quantity_sold integer,
  sales_start timestamptz,
  sales_end timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name, t.description, t.price_usd, t.quantity_available, t.quantity_sold, t.sales_start, t.sales_end
  from public.ticket_types t
  join public.events e on e.id = t.event_id
  where t.event_id = p_event_id
    and e.published = true
  order by t.price_usd asc, t.created_at asc;
$$;
grant execute on function public.public_event_ticket_types(uuid) to anon, authenticated;

-- ---- registrations: link back to the ticket purchased (null = free/no ticket types) ----
alter table public.registrations
  add column if not exists ticket_type_id uuid references public.ticket_types (id) on delete set null;

-- ---- paystack_transactions: generalize beyond "pay to publish an event" ----
-- purpose discriminates what finalizePaystackTransaction should do once a payment
-- succeeds: 'event_publish' (existing behavior — publish the event) or
-- 'ticket_purchase' (create the attendee's registration row + send their QR code).
-- registrant_data carries everything needed to create that registration, since for a
-- paid ticket the registration must not exist until payment actually succeeds.
alter table public.paystack_transactions
  add column if not exists purpose text not null default 'event_publish' check (purpose in ('event_publish', 'ticket_purchase')),
  add column if not exists ticket_type_id uuid references public.ticket_types (id) on delete set null,
  add column if not exists registrant_data jsonb,
  add column if not exists subaccount_code text;
