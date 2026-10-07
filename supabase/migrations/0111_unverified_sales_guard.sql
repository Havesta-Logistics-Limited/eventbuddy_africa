-- Guards against fake events (2026-10-07). Holding the money protects
-- eventbuddy, but not a buyer who pays for an event that never happens. Until
-- a platform admin verifies an organizer (organizations.payout_verified):
--
--   * their paid ticket sales stop at a cap (platform_settings
--     .unverified_ticket_cap, across all their events; null = no cap). Free
--     registrations are never capped. A group bundle counts as one sale.
--   * platform admins get a risk alert when they near or hit the cap, or
--     sell a lot in one day (risk_spike_tickets in 24 hours).
--
-- Alerts are deduplicated by key, so each threshold alerts once.

alter table public.platform_settings
  add column if not exists unverified_ticket_cap integer default 100,
  add column if not exists risk_spike_tickets integer not null default 30;
alter table public.platform_settings drop constraint if exists platform_settings_risk_numbers_valid;
alter table public.platform_settings add constraint platform_settings_risk_numbers_valid
  check ((unverified_ticket_cap is null or unverified_ticket_cap between 1 and 1000000) and risk_spike_tickets between 1 and 1000000);

create table if not exists public.risk_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  kind text not null check (kind in ('cap_near', 'cap_reached', 'sales_spike')),
  tickets integer not null default 0,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
create index if not exists risk_alerts_open_idx on public.risk_alerts (created_at desc) where resolved_at is null;

alter table public.risk_alerts enable row level security;
drop policy if exists "risk_alerts_platform_admin" on public.risk_alerts;
create policy "risk_alerts_platform_admin" on public.risk_alerts
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Paid tickets an organization has sold (successful ticket payments, all
-- events). Server-side only.
create or replace function public.org_paid_tickets_sold(p_org uuid, p_since timestamptz default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.paystack_transactions t
  where t.organization_id = p_org
    and t.purpose = 'ticket_purchase'
    and t.status = 'success'
    and t.amount_naira > 0
    and (p_since is null or coalesce(t.verified_at, t.created_at) >= p_since);
$$;
revoke all on function public.org_paid_tickets_sold(uuid, timestamptz) from public, anon, authenticated;

-- What an organizer sees about their own limit (sold, cap, verified).
create or replace function public.my_sales_limit()
returns table (verified boolean, cap integer, sold integer)
language sql
stable
security definer
set search_path = public
as $$
  select o.payout_verified,
         case when o.payout_verified then null else s.unverified_ticket_cap end,
         public.org_paid_tickets_sold(o.id)
  from public.organizations o
  cross join public.platform_settings s
  where o.id in (select public.owned_organization_ids())
  limit 1;
$$;
grant execute on function public.my_sales_limit() to authenticated;
