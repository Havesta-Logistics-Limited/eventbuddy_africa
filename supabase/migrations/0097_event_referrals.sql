-- Referral partners: per-event share links, attribution of what each link
-- brought in, and the commission owed on it at the end of the event.
--
-- Attribution is stored on BOTH registrations and paystack_transactions, on
-- purpose. A paid ticket's registration row does not exist until the payment
-- finalizes, so the referral has to be recorded on the transaction at
-- initialize and copied across afterwards. Keeping it on the transaction too
-- means an abandoned checkout is still attributable, which is what makes
-- "clicks vs sales" answerable rather than guesswork.
--
-- Money lives on paystack_transactions (amount_naira gross, platform_fee_naira,
-- net_amount_naira after eventbuddy's cut — see 0090), never on registrations,
-- so every commission figure is derived by joining through to the transaction.
-- Nothing here is denormalised: a rate can be corrected after the fact and the
-- report simply recomputes.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create table if not exists public.event_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,

  -- What goes in the link: <public event url>?ref=<code>. Short and
  -- human-readable so a partner can say it out loud.
  code text not null check (length(trim(code)) between 2 and 40),
  partner_name text not null check (length(trim(partner_name)) > 0),
  partner_email text,
  partner_phone text,

  -- percent_gross  — % of the ticket price the buyer paid
  -- percent_net    — % of what actually reached the organizer (after eventbuddy's fee)
  -- fixed_per_sale — flat naira per PAID ticket
  -- fixed_per_reg  — flat naira per attributed registration, free ones included
  --                  (how a free event pays for signups)
  -- none           — tracked for attribution only, earns nothing
  commission_type text not null default 'percent_gross'
    check (commission_type in ('percent_gross', 'percent_net', 'fixed_per_sale', 'fixed_per_reg', 'none')),
  commission_rate numeric(12, 2) not null default 0 check (commission_rate >= 0),
  constraint event_referrals_percent_max
    check (commission_type not in ('percent_gross', 'percent_net') or commission_rate <= 100),

  -- Turning a partner off stops new attribution; everything already credited to
  -- them stays credited, because they already earned it.
  is_active boolean not null default true,

  -- Counted when a link is first opened in a browser session, best-effort — it
  -- is a traffic signal, never money, and is allowed to be approximate.
  click_count integer not null default 0,

  notes text,
  created_at timestamptz not null default now()
);

-- "PARTNER1" and "partner1" are the same link.
create unique index if not exists event_referrals_event_code_key
  on public.event_referrals (event_id, upper(code));
create index if not exists event_referrals_organization_id_idx
  on public.event_referrals (organization_id);
create index if not exists event_referrals_event_id_idx
  on public.event_referrals (event_id);

alter table public.event_referrals alter column organization_id set default public.current_organization_id();

alter table public.event_referrals enable row level security;

create policy "event_referrals_all_own_org" on public.event_referrals
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "event_referrals_select_platform_admin" on public.event_referrals
  for select using (public.is_platform_admin());

-- Attribution. on delete set null: removing a partner must never remove the
-- registration or the payment that came through them.
alter table public.registrations
  add column if not exists referral_id uuid references public.event_referrals (id) on delete set null;
alter table public.paystack_transactions
  add column if not exists referral_id uuid references public.event_referrals (id) on delete set null;
-- Virtual events record a signup as a LEAD rather than a registration (see the
-- register route), so without this a virtual event could never be attributed.
alter table public.leads
  add column if not exists referral_id uuid references public.event_referrals (id) on delete set null;

create index if not exists registrations_referral_id_idx
  on public.registrations (referral_id) where referral_id is not null;
create index if not exists paystack_transactions_referral_id_idx
  on public.paystack_transactions (referral_id) where referral_id is not null;
create index if not exists leads_referral_id_idx
  on public.leads (referral_id) where referral_id is not null;

-- Resolve a code to an id for the public register / ticket-purchase routes.
-- Security definer so an anonymous visitor can be attributed without being able
-- to read the partner list (their names, contacts and rates are private). It
-- returns only an id, and only for an ACTIVE partner on that exact event.
create or replace function public.public_resolve_referral(p_event_id uuid, p_code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.event_referrals
  where event_id = p_event_id
    and upper(code) = upper(trim(p_code))
    and is_active
  limit 1;
$$;

revoke all on function public.public_resolve_referral(uuid, text) from public;
grant execute on function public.public_resolve_referral(uuid, text) to anon, authenticated;

-- Click counter for the same anonymous callers. Bumps one row and returns
-- nothing; it cannot be used to read or discover codes.
create or replace function public.public_count_referral_click(p_event_id uuid, p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.event_referrals
  set click_count = click_count + 1
  where event_id = p_event_id
    and upper(code) = upper(trim(p_code))
    and is_active;
$$;

revoke all on function public.public_count_referral_click(uuid, text) from public;
grant execute on function public.public_count_referral_click(uuid, text) to anon, authenticated;
