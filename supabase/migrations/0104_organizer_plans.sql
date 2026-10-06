-- Organizer plans (2026-10-06): Launch (free), Grow and Scale.
--
-- A plan sets the organizer's ticket fee and how many promoters they can have
-- active per event (enforced once promoters ship). Launch has no fee columns
-- of its own: it uses platform_settings' ticket fee, so the existing fee
-- editor in platform admin keeps working as the Launch rate.
--
-- Paid plans bill monthly through Paystack Subscriptions. A platform admin can
-- also give an organization a plan directly (no payment), e.g. for a partner
-- or for testing.
create table if not exists public.organizer_plans (
  id text primary key check (id in ('launch', 'grow', 'scale')),
  name text not null,
  price_monthly_naira numeric(12, 2) not null default 0 check (price_monthly_naira >= 0),
  -- null on Launch: use platform_settings.ticket_fee_percentage / _flat_naira
  fee_percentage numeric(5, 2) check (fee_percentage is null or fee_percentage between 0 and 100),
  fee_flat_naira numeric(12, 2) check (fee_flat_naira is null or fee_flat_naira >= 0),
  -- null = unlimited
  max_promoters_per_event integer check (max_promoters_per_event is null or max_promoters_per_event >= 0),
  -- the matching Paystack plan, created from platform admin
  paystack_plan_code text,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.organizer_plans (id, name, price_monthly_naira, fee_percentage, fee_flat_naira, max_promoters_per_event, sort) values
  ('launch', 'Launch', 0, null, null, 5, 1),
  ('grow', 'Grow', 15000, 4, 100, null, 2),
  ('scale', 'Scale', 45000, 3, 100, null, 3)
on conflict (id) do nothing;

alter table public.organizer_plans enable row level security;
drop policy if exists "organizer_plans_read" on public.organizer_plans;
create policy "organizer_plans_read" on public.organizer_plans for select using (true);
drop policy if exists "organizer_plans_platform_admin" on public.organizer_plans;
create policy "organizer_plans_platform_admin" on public.organizer_plans
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

alter table public.organizations
  add column if not exists plan_id text not null default 'launch' references public.organizer_plans (id),
  -- active: paid up · past_due: a renewal failed (grace period) · cancelling:
  -- won't renew, keeps the plan until plan_period_end
  add column if not exists plan_status text not null default 'active',
  add column if not exists plan_period_end timestamptz,
  -- set when a platform admin assigns a plan without payment
  add column if not exists plan_comped boolean not null default false,
  add column if not exists paystack_customer_code text,
  add column if not exists paystack_subscription_code text,
  add column if not exists paystack_subscription_token text;
alter table public.organizations drop constraint if exists organizations_plan_status_check;
alter table public.organizations add constraint organizations_plan_status_check
  check (plan_status in ('active', 'past_due', 'cancelling'));

-- Subscription checkouts reuse paystack_transactions so the same verify and
-- webhook path finalizes them.
alter table public.paystack_transactions drop constraint if exists paystack_transactions_purpose_check;
alter table public.paystack_transactions add constraint paystack_transactions_purpose_check
  check (purpose in ('event_publish', 'ticket_purchase', 'subscription'));
alter table public.paystack_transactions add column if not exists plan_id text references public.organizer_plans (id);
-- a plan payment belongs to no event
alter table public.paystack_transactions alter column event_id drop not null;

-- The plan an organization actually gets right now: a paid plan lapses 3 days
-- after its period ends without a renewal (comped plans never lapse).
create or replace function public.effective_plan_id(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.plan_id = 'launch' then 'launch'
    when o.plan_comped then o.plan_id
    when o.plan_period_end is null or o.plan_period_end + interval '3 days' > now() then o.plan_id
    else 'launch'
  end
  from public.organizations o where o.id = p_org;
$$;
grant execute on function public.effective_plan_id(uuid) to authenticated, service_role;

-- Plan and billing columns are set by eventbuddy (webhooks, platform admin),
-- never by the organizer's own browser: extend 0103's protection to them.
create or replace function public.protect_organization_plan_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_platform_admin() then
    new.plan_id := old.plan_id;
    new.plan_status := old.plan_status;
    new.plan_period_end := old.plan_period_end;
    new.plan_comped := old.plan_comped;
    new.paystack_customer_code := old.paystack_customer_code;
    new.paystack_subscription_code := old.paystack_subscription_code;
    new.paystack_subscription_token := old.paystack_subscription_token;
  end if;
  return new;
end;
$$;
drop trigger if exists organizations_protect_plan_columns on public.organizations;
create trigger organizations_protect_plan_columns
  before update on public.organizations
  for each row execute function public.protect_organization_plan_columns();
