-- Real Paystack payment collection for physical events. Virtual events stay free and
-- publish immediately, same as today. A new physical event is created UNPUBLISHED
-- (published = false) — it exists in the database (so the admin can resume checkout
-- if they abandon it) but is inert: staff can't check in, leads can't be captured, and
-- self-service registration doesn't list it, until payment actually succeeds.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.events add column if not exists published boolean not null default true;
-- Every event that already exists predates this feature and is already effectively
-- live — only NEW physical events going forward start unpublished.

create table if not exists public.paystack_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  reference text not null unique,
  -- amount_usd is the event's USD price, kept for reporting/display — it is NOT what
  -- Paystack actually verifies a payment against, since this account only supports NGN
  -- (confirmed directly against the Paystack API), not USD. charge_currency/
  -- charge_amount_minor is the exact amount actually sent to Paystack at initialize
  -- time (in the smallest unit — kobo for NGN), and is what finalizePaystackTransaction
  -- compares the verified payment against — never recomputed from amount_usd, so a
  -- currency or exchange-rate change between initialize and verify can't cause a
  -- mismatch or, worse, quietly accept a short payment.
  amount_usd numeric(10, 2) not null,
  charge_currency text not null default 'NGN',
  charge_amount_minor bigint not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  paystack_event jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists paystack_transactions_event_id_idx on public.paystack_transactions (event_id);
create index if not exists paystack_transactions_org_id_idx on public.paystack_transactions (organization_id);

alter table public.paystack_transactions enable row level security;

-- Read-only for the org that owns the transaction, or a platform admin. All writes
-- (initialize/verify/webhook) go through the service-role API routes, which bypass RLS
-- entirely — same pattern as every other payment-adjacent table in this app. There is
-- deliberately no insert/update policy here: an org's own browser client can never
-- write a transaction row, only read the ones that already exist.
create policy "paystack_transactions_select_own_org" on public.paystack_transactions
  for select using (organization_id in (select public.owned_organization_ids()));
create policy "paystack_transactions_select_platform_admin" on public.paystack_transactions
  for select using (public.is_platform_admin());

-- Closes a real bypass: without this, an org admin's own RLS-scoped browser client
-- (already granted full CRUD on its own events via events_all_own_org) could just
-- UPDATE events SET published = true directly, skipping payment entirely. This trigger
-- reverts any change to published/payment_status unless it comes from the service-role
-- key (the Paystack routes) or an authenticated platform admin (the existing manual
-- "mark paid" toggle on the platform Billing/Events tab) — everyone else's attempted
-- change to these two columns is silently ignored, every other column stays fully
-- editable as before.
create or replace function public.protect_event_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_platform_admin() then
    if new.published is distinct from old.published then
      new.published := old.published;
    end if;
    if new.payment_status is distinct from old.payment_status then
      new.payment_status := old.payment_status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_protect_payment_fields on public.events;
create trigger events_protect_payment_fields
  before update on public.events
  for each row execute function public.protect_event_payment_fields();
