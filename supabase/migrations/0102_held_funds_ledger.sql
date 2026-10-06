-- Held funds and payout requests (2026-10-06).
--
-- Until now every paid ticket split at charge time: the organizer's Paystack
-- subaccount received the sale and eventbuddy's fee came off the top. From the
-- moment platform_settings.held_funds_enabled is switched on, new checkouts no
-- longer carry a subaccount: the whole payment lands in eventbuddy's Paystack
-- balance and is recorded here, in a ledger, as money eventbuddy owes the
-- organizer. Organizers then request payouts from their dashboard, a platform
-- admin approves each one, and it is sent by Paystack Transfer (or marked as
-- paid by hand). Refunds and disputes simply debit the ledger, so nothing ever
-- has to be clawed back from a bank account.
--
-- Sales made before the switch were already paid out by the split and never
-- enter the ledger (paystack_transactions.settlement = 'split').
--
-- Availability, modelled on how established Nigerian ticketing platforms work:
--   * a sale clears at the start of the next business day (Africa/Lagos),
--     skipping weekends and public_holidays;
--   * for an organizer that isn't payout-verified, a sale stays locked until
--     unverified_lock_days after its event ends;
--   * a sale's fee, refund and dispute sit in the same bucket as the sale;
--     payouts and adjustments count at once.

-- ---- settings -------------------------------------------------------------
alter table public.platform_settings
  add column if not exists held_funds_enabled boolean not null default false,
  add column if not exists held_funds_since timestamptz,
  add column if not exists payout_min_naira numeric(12, 2) not null default 5000,
  add column if not exists payout_fee_naira numeric(12, 2) not null default 100,
  add column if not exists unverified_lock_days integer not null default 3;
alter table public.platform_settings drop constraint if exists platform_settings_payout_numbers_valid;
alter table public.platform_settings add constraint platform_settings_payout_numbers_valid
  check (payout_min_naira >= 0 and payout_fee_naira >= 0 and unverified_lock_days between 0 and 60);

-- ---- organizations --------------------------------------------------------
alter table public.organizations
  -- set by a platform admin; verified organizers can withdraw cleared money
  -- from live events instead of waiting for the event to end
  add column if not exists payout_verified boolean not null default false,
  add column if not exists payout_verified_at timestamptz,
  -- Paystack transfer recipient for the saved bank account; cleared whenever
  -- the bank details change so the next payout creates a fresh one
  add column if not exists payout_recipient_code text;

-- ---- transactions ---------------------------------------------------------
alter table public.paystack_transactions
  add column if not exists settlement text not null default 'split';
alter table public.paystack_transactions drop constraint if exists paystack_transactions_settlement_check;
alter table public.paystack_transactions add constraint paystack_transactions_settlement_check
  check (settlement in ('split', 'held'));

-- ---- public holidays (skipped when a sale clears) -------------------------
create table if not exists public.public_holidays (
  day date primary key,
  name text not null default ''
);
alter table public.public_holidays enable row level security;
drop policy if exists "public_holidays_read" on public.public_holidays;
create policy "public_holidays_read" on public.public_holidays for select using (true);
drop policy if exists "public_holidays_platform_admin" on public.public_holidays;
create policy "public_holidays_platform_admin" on public.public_holidays
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---- payout requests ------------------------------------------------------
create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount_naira numeric(12, 2) not null check (amount_naira > 0),
  fee_naira numeric(12, 2) not null default 0 check (fee_naira >= 0),
  -- requested -> processing (transfer sent) -> paid | failed
  -- requested -> paid (marked paid by hand) | rejected | cancelled
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'paid', 'failed', 'rejected', 'cancelled')),
  -- the bank account as it was when requested, so history stays truthful
  bank_name text,
  account_number_last4 text,
  account_name text,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  transfer_reference text unique,
  transfer_code text,
  paid_at timestamptz,
  failure_reason text
);
create index if not exists payout_requests_org_idx on public.payout_requests (organization_id, requested_at desc);
create index if not exists payout_requests_status_idx on public.payout_requests (status);

alter table public.payout_requests enable row level security;
drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own" on public.payout_requests
  for select using (organization_id in (select public.owned_organization_ids()));
drop policy if exists "payout_requests_select_platform_admin" on public.payout_requests;
create policy "payout_requests_select_platform_admin" on public.payout_requests
  for select using (public.is_platform_admin());
-- every write goes through request_payout / cancel_payout or the service role

-- ---- ledger ---------------------------------------------------------------
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  transaction_id uuid references public.paystack_transactions (id) on delete set null,
  payout_id uuid references public.payout_requests (id) on delete set null,
  -- sale (+), fee (-), refund (-), dispute (-), payout (-), payout_fee (-),
  -- payout_return (+, a rejected/failed/cancelled payout coming back),
  -- payout_fee_return (+), adjustment (+/-, platform admin only)
  kind text not null check (kind in ('sale', 'fee', 'refund', 'dispute', 'payout', 'payout_fee', 'payout_return', 'payout_fee_return', 'adjustment')),
  amount_naira numeric(12, 2) not null,
  -- when a credit becomes withdrawable (before any event lock); debits use now()
  clears_at timestamptz not null default now(),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
-- idempotency: a transaction or payout posts each kind at most once, so a
-- webhook and a browser callback racing can never double-credit
-- (plain, not partial, so upserts can target them; NULLs never collide)
create unique index if not exists ledger_entries_txn_kind_key on public.ledger_entries (transaction_id, kind);
create unique index if not exists ledger_entries_payout_kind_key on public.ledger_entries (payout_id, kind);
create index if not exists ledger_entries_org_idx on public.ledger_entries (organization_id, created_at desc);

alter table public.ledger_entries enable row level security;
drop policy if exists "ledger_entries_select_own" on public.ledger_entries;
create policy "ledger_entries_select_own" on public.ledger_entries
  for select using (organization_id in (select public.owned_organization_ids()));
drop policy if exists "ledger_entries_select_platform_admin" on public.ledger_entries;
create policy "ledger_entries_select_platform_admin" on public.ledger_entries
  for select using (public.is_platform_admin());
-- no insert/update/delete policies: entries are written by the service role
-- and the functions below, and are never edited (corrections are new rows)

-- ---- clearing time: start of the next business day in Lagos ---------------
create or replace function public.ledger_clear_time(p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  d date := (p_at at time zone 'Africa/Lagos')::date + 1;
begin
  while extract(isodow from d) in (6, 7) or exists (select 1 from public.public_holidays h where h.day = d) loop
    d := d + 1;
  end loop;
  return d::timestamp at time zone 'Africa/Lagos';
end;
$$;

-- ---- balance --------------------------------------------------------------
-- Internal: not callable by clients (see the revoke below); account_balance
-- and request_payout wrap it with their own access checks.
create or replace function public._org_balance(p_org uuid)
returns table (total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select unverified_lock_days from public.platform_settings where id),
  o as (select payout_verified from public.organizations where id = p_org),
  e as (
    select
      l.amount_naira,
      l.kind,
      -- a sale's fee, refund and dispute follow the sale into the same bucket,
      -- so money still clearing or locked on one event never blocks another
      coalesce(case when l.kind in ('fee', 'refund', 'dispute') then sale.clears_at end, l.clears_at) as clears_at,
      ev.id as event_id,
      ev.date as event_date,
      ev.end_date as event_end_date,
      ev.timezone as event_tz
    from public.ledger_entries l
    left join public.ledger_entries sale on sale.transaction_id = l.transaction_id and sale.kind = 'sale' and l.transaction_id is not null
    left join public.events ev on ev.id = l.event_id
    where l.organization_id = p_org
  ),
  b as (
    select
      amount_naira,
      kind,
      case
        when kind not in ('sale', 'fee', 'refund', 'dispute') then 'available'
        when clears_at > now() then 'pending'
        when not (select payout_verified from o) and event_id is not null
             and now() < ((coalesce(event_end_date, event_date) + 1)::timestamp at time zone coalesce(nullif(event_tz, ''), 'Africa/Lagos'))
                         + make_interval(days => (select unverified_lock_days from s))
          then 'locked'
        else 'available'
      end as bucket
    from e
  )
  select
    coalesce(sum(amount_naira), 0),
    coalesce(sum(amount_naira) filter (where bucket = 'pending'), 0),
    coalesce(sum(amount_naira) filter (where bucket = 'locked'), 0),
    coalesce(sum(amount_naira) filter (where bucket = 'available'), 0),
    coalesce(-sum(amount_naira) filter (where kind = 'payout'), 0)
      - coalesce(sum(amount_naira) filter (where kind = 'payout_return'), 0)
  from b;
$$;
revoke all on function public._org_balance(uuid) from public, anon, authenticated;

-- Paid-out figure above counts payouts that weren't returned, including ones
-- still waiting for approval; the dashboard shows those separately.
create or replace function public.account_balance(p_org uuid)
returns table (total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (p_org in (select public.owned_organization_ids()) or public.is_platform_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from public._org_balance(p_org);
end;
$$;
grant execute on function public.account_balance(uuid) to authenticated;

-- ---- request / cancel a payout (organization owner only) ------------------
create or replace function public.request_payout(p_org uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_org record;
  v_available numeric;
  v_id uuid;
begin
  select * into v_org from public.organizations where id = p_org for update;
  if v_org.id is null or v_org.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the organization owner can request a payout.' using errcode = '42501';
  end if;
  select * into v_settings from public.platform_settings where id;
  if not v_settings.held_funds_enabled then
    raise exception 'Payout requests aren''t switched on yet.';
  end if;
  if v_org.payout_account_number is null then
    raise exception 'Add your bank account in Settings before requesting a payout.';
  end if;
  if v_org.payout_change_status = 'requested' then
    raise exception 'Your bank account change is waiting for approval. You can request a payout once it''s approved.';
  end if;
  if exists (select 1 from public.payout_requests where organization_id = p_org and status in ('requested', 'processing')) then
    raise exception 'You already have a payout in progress. Wait for it to finish or cancel it first.';
  end if;
  p_amount := round(p_amount, 2);
  if p_amount < v_settings.payout_min_naira then
    raise exception 'The minimum payout is ₦%.', to_char(v_settings.payout_min_naira, 'FM999,999,999');
  end if;
  select available_naira into v_available from public._org_balance(p_org);
  if p_amount + v_settings.payout_fee_naira > v_available then
    raise exception 'That''s more than you can withdraw right now (₦% available, including the ₦% payout fee).',
      to_char(greatest(v_available, 0), 'FM999,999,999.00'), to_char(v_settings.payout_fee_naira, 'FM999,999');
  end if;

  insert into public.payout_requests (organization_id, amount_naira, fee_naira, bank_name, account_number_last4, account_name, requested_by)
  values (p_org, p_amount, v_settings.payout_fee_naira, v_org.payout_bank_name, right(v_org.payout_account_number, 4), v_org.payout_account_name, auth.uid())
  returning id into v_id;

  -- reserve the money now so it can't be requested twice
  insert into public.ledger_entries (organization_id, payout_id, kind, amount_naira, created_by, note)
  values (p_org, v_id, 'payout', -p_amount, auth.uid(), 'Payout requested');
  if v_settings.payout_fee_naira > 0 then
    insert into public.ledger_entries (organization_id, payout_id, kind, amount_naira, created_by, note)
    values (p_org, v_id, 'payout_fee', -v_settings.payout_fee_naira, auth.uid(), 'Payout processing fee');
  end if;
  return v_id;
end;
$$;
grant execute on function public.request_payout(uuid, numeric) to authenticated;

-- Returns a payout's reserved money to the balance. Shared by cancel (owner),
-- reject and failed transfers (service role).
create or replace function public._return_payout(p_payout uuid, p_status text, p_note text, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.payout_requests where id = p_payout for update;
  if v.id is null then raise exception 'Payout not found.'; end if;
  if v.status not in ('requested', 'processing') then
    raise exception 'This payout is already %.', v.status;
  end if;
  update public.payout_requests
  set status = p_status, decided_by = coalesce(decided_by, p_by), decided_at = coalesce(decided_at, now()),
      decision_note = case when p_status = 'failed' then decision_note else p_note end,
      failure_reason = case when p_status = 'failed' then p_note else failure_reason end
  where id = p_payout;
  insert into public.ledger_entries (organization_id, payout_id, kind, amount_naira, created_by, note)
  values (v.organization_id, p_payout, 'payout_return', v.amount_naira, p_by, 'Payout ' || p_status)
  on conflict do nothing;
  if v.fee_naira > 0 then
    insert into public.ledger_entries (organization_id, payout_id, kind, amount_naira, created_by, note)
    values (v.organization_id, p_payout, 'payout_fee_return', v.fee_naira, p_by, 'Payout fee returned')
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function public._return_payout(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.cancel_payout(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select pr.status, o.owner_user_id into v
  from public.payout_requests pr join public.organizations o on o.id = pr.organization_id
  where pr.id = p_payout;
  if v.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the organization owner can cancel this payout.' using errcode = '42501';
  end if;
  if v.status <> 'requested' then
    raise exception 'This payout can no longer be cancelled.';
  end if;
  perform public._return_payout(p_payout, 'cancelled', 'Cancelled by organizer', auth.uid());
end;
$$;
grant execute on function public.cancel_payout(uuid) to authenticated;

-- The service role (platform admin routes, the Paystack webhook) calls this
-- for rejected and failed payouts.
create or replace function public.return_payout(p_payout uuid, p_status text, p_note text, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('rejected', 'failed') then raise exception 'Invalid status.'; end if;
  perform public._return_payout(p_payout, p_status, p_note, p_by);
end;
$$;
revoke all on function public.return_payout(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.return_payout(uuid, text, text, uuid) to service_role;
grant execute on function public._org_balance(uuid) to service_role;
