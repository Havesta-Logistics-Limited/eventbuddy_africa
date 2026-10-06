-- Promoter marketplace (2026-10-06), step 3 of held funds + promoters.
--
-- Promoters are people who sign up themselves, pick a public handle, and
-- share events for a commission. They are not organization members: a
-- promoter is a row here tied to their auth user.
--
-- An organizer opts an event in (events.promoter_*): a commission as a % of
-- their net after eventbuddy's fee (minimum 5%), an optional cap per ticket,
-- and who can join (open to any promoter, or invite only). Joining creates an
-- event_referrals row with promoter_id set and code = the promoter's handle,
-- so the existing ?ref= capture, click counting and attribution all apply.
--
-- Money: when a held sale that came through a promoter's link finalizes, the
-- commission moves in the ledger from the organizer (kind 'commission') to
-- the promoter (kind 'commission_earned'), in the same clearing/locked bucket
-- as the sale. A refund reverses both. Promoters request payouts like
-- organizers do, approved by a platform admin.

-- ---- promoters ------------------------------------------------------------
create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- lower-case letters, digits and underscores; also used in share links
  handle text not null check (handle ~ '^[a-z0-9_]{3,24}$'),
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  phone text,
  payout_bank_code text,
  payout_bank_name text,
  payout_account_number text,
  payout_account_name text,
  payout_recipient_code text,
  payout_change_status text not null default 'none' check (payout_change_status in ('none', 'requested', 'approved')),
  payout_change_requested_at timestamptz,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists promoters_handle_key on public.promoters (lower(handle));

alter table public.promoters enable row level security;
drop policy if exists "promoters_select_own" on public.promoters;
create policy "promoters_select_own" on public.promoters for select using (user_id = auth.uid());
drop policy if exists "promoters_select_platform_admin" on public.promoters;
create policy "promoters_select_platform_admin" on public.promoters for select using (public.is_platform_admin());
drop policy if exists "promoters_update_own" on public.promoters;
create policy "promoters_update_own" on public.promoters for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "promoters_update_platform_admin" on public.promoters;
create policy "promoters_update_platform_admin" on public.promoters for update using (public.is_platform_admin()) with check (public.is_platform_admin());

-- A promoter edits their name and phone from the browser; everything else
-- (handle, bank details, suspension) goes through eventbuddy's routes.
create or replace function public.protect_promoter_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_platform_admin() then
    new.user_id := old.user_id;
    new.handle := old.handle;
    new.email := old.email;
    new.payout_bank_code := old.payout_bank_code;
    new.payout_bank_name := old.payout_bank_name;
    new.payout_account_number := old.payout_account_number;
    new.payout_account_name := old.payout_account_name;
    new.payout_recipient_code := old.payout_recipient_code;
    new.payout_change_status := old.payout_change_status;
    new.payout_change_requested_at := old.payout_change_requested_at;
    new.is_suspended := old.is_suspended;
  end if;
  return new;
end;
$$;
drop trigger if exists promoters_protect_columns on public.promoters;
create trigger promoters_protect_columns before update on public.promoters
  for each row execute function public.protect_promoter_columns();

create or replace function public.my_promoter_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.promoters where user_id = auth.uid();
$$;
grant execute on function public.my_promoter_id() to authenticated;

-- ---- event settings -------------------------------------------------------
alter table public.events
  add column if not exists promoter_program_enabled boolean not null default false,
  add column if not exists promoter_commission_pct numeric(5, 2) not null default 10,
  add column if not exists promoter_commission_cap_naira numeric(12, 2),
  add column if not exists promoter_access text not null default 'open',
  add column if not exists promoter_share_caption text;
alter table public.events drop constraint if exists events_promoter_settings_valid;
alter table public.events add constraint events_promoter_settings_valid check (
  promoter_commission_pct between 5 and 100
  and (promoter_commission_cap_naira is null or promoter_commission_cap_naira > 0)
  and promoter_access in ('open', 'verified', 'invite')
);

-- ---- referrals: a promoter's link on an event ------------------------------
alter table public.event_referrals add column if not exists promoter_id uuid references public.promoters (id) on delete set null;
create unique index if not exists event_referrals_event_promoter_key on public.event_referrals (event_id, promoter_id) where promoter_id is not null;
drop policy if exists "event_referrals_select_promoter" on public.event_referrals;
create policy "event_referrals_select_promoter" on public.event_referrals
  for select using (promoter_id is not null and promoter_id = public.my_promoter_id());

-- ---- ledger and payouts: either an organization's or a promoter's ---------
alter table public.ledger_entries alter column organization_id drop not null;
alter table public.ledger_entries add column if not exists promoter_id uuid references public.promoters (id) on delete cascade;
alter table public.ledger_entries drop constraint if exists ledger_entries_one_account;
alter table public.ledger_entries add constraint ledger_entries_one_account check ((organization_id is null) <> (promoter_id is null));
alter table public.ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table public.ledger_entries add constraint ledger_entries_kind_check check (kind in (
  'sale', 'fee', 'refund', 'dispute', 'payout', 'payout_fee', 'payout_return', 'payout_fee_return', 'adjustment',
  -- organizer side of a promoter sale, and its refund
  'commission', 'commission_refund',
  -- promoter side
  'commission_earned', 'commission_reversal'
));
create index if not exists ledger_entries_promoter_idx on public.ledger_entries (promoter_id, created_at desc) where promoter_id is not null;
drop policy if exists "ledger_entries_select_promoter" on public.ledger_entries;
create policy "ledger_entries_select_promoter" on public.ledger_entries
  for select using (promoter_id is not null and promoter_id = public.my_promoter_id());

alter table public.payout_requests alter column organization_id drop not null;
alter table public.payout_requests add column if not exists promoter_id uuid references public.promoters (id) on delete cascade;
alter table public.payout_requests drop constraint if exists payout_requests_one_account;
alter table public.payout_requests add constraint payout_requests_one_account check ((organization_id is null) <> (promoter_id is null));
drop policy if exists "payout_requests_select_promoter" on public.payout_requests;
create policy "payout_requests_select_promoter" on public.payout_requests
  for select using (promoter_id is not null and promoter_id = public.my_promoter_id());

-- ---- balances -------------------------------------------------------------
-- One balance function for both account kinds. Entries tied to a ticket sale
-- (its fee, refund, dispute and commission lines, on either side) follow the
-- sale into its bucket. Promoters are never "verified", so their earnings on
-- an event stay locked until unverified_lock_days after it ends: refunds are
-- most likely before then.
create or replace function public._ledger_balance(p_org uuid, p_promoter uuid)
returns table (total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select unverified_lock_days from public.platform_settings where id),
  v as (
    select case when p_org is not null then coalesce((select payout_verified from public.organizations where id = p_org), false) else false end as verified
  ),
  e as (
    select
      l.amount_naira,
      l.kind,
      coalesce(case when l.kind <> 'sale' then sale.clears_at end, l.clears_at) as clears_at,
      ev.id as event_id,
      ev.date as event_date,
      ev.end_date as event_end_date,
      ev.timezone as event_tz
    from public.ledger_entries l
    left join public.ledger_entries sale on sale.transaction_id = l.transaction_id and sale.kind = 'sale' and l.transaction_id is not null
    left join public.events ev on ev.id = l.event_id
    where (p_org is not null and l.organization_id = p_org) or (p_promoter is not null and l.promoter_id = p_promoter)
  ),
  b as (
    select
      amount_naira,
      kind,
      case
        when kind not in ('sale', 'fee', 'refund', 'dispute', 'commission', 'commission_refund', 'commission_earned', 'commission_reversal') then 'available'
        when clears_at > now() then 'pending'
        when not (select verified from v) and event_id is not null
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
revoke all on function public._ledger_balance(uuid, uuid) from public, anon, authenticated;
grant execute on function public._ledger_balance(uuid, uuid) to service_role;

-- organizers: unchanged signature, now backed by the shared function
create or replace function public._org_balance(p_org uuid)
returns table (total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
language sql
stable
security definer
set search_path = public
as $$
  select * from public._ledger_balance(p_org, null);
$$;
revoke all on function public._org_balance(uuid) from public, anon, authenticated;
grant execute on function public._org_balance(uuid) to service_role;

create or replace function public.promoter_balance(p_promoter uuid default null)
returns table (total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_promoter, public.my_promoter_id());
begin
  if v_id is null or not (v_id = public.my_promoter_id() or public.is_platform_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from public._ledger_balance(null, v_id);
end;
$$;
grant execute on function public.promoter_balance(uuid) to authenticated;

create or replace function public.request_promoter_payout(p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_p record;
  v_available numeric;
  v_id uuid;
begin
  select * into v_p from public.promoters where user_id = auth.uid() for update;
  if v_p.id is null then raise exception 'Only promoters can request a promoter payout.' using errcode = '42501'; end if;
  if v_p.is_suspended then raise exception 'Your promoter account is suspended. Contact eventbuddy.'; end if;
  select * into v_settings from public.platform_settings where id;
  if not v_settings.held_funds_enabled then raise exception 'Payout requests aren''t switched on yet.'; end if;
  if v_p.payout_account_number is null then raise exception 'Add your bank account before requesting a payout.'; end if;
  if v_p.payout_change_status = 'requested' then
    raise exception 'Your bank account change is waiting for approval. You can request a payout once it''s approved.';
  end if;
  if exists (select 1 from public.payout_requests where promoter_id = v_p.id and status in ('requested', 'processing')) then
    raise exception 'You already have a payout in progress. Wait for it to finish or cancel it first.';
  end if;
  p_amount := round(p_amount, 2);
  if p_amount < v_settings.payout_min_naira then
    raise exception 'The minimum payout is ₦%.', to_char(v_settings.payout_min_naira, 'FM999,999,999');
  end if;
  select available_naira into v_available from public._ledger_balance(null, v_p.id);
  if p_amount + v_settings.payout_fee_naira > v_available then
    raise exception 'That''s more than you can withdraw right now (₦% available, including the ₦% payout fee).',
      to_char(greatest(v_available, 0), 'FM999,999,999.00'), to_char(v_settings.payout_fee_naira, 'FM999,999');
  end if;
  insert into public.payout_requests (promoter_id, amount_naira, fee_naira, bank_name, account_number_last4, account_name, requested_by)
  values (v_p.id, p_amount, v_settings.payout_fee_naira, v_p.payout_bank_name, right(v_p.payout_account_number, 4), v_p.payout_account_name, auth.uid())
  returning id into v_id;
  insert into public.ledger_entries (promoter_id, payout_id, kind, amount_naira, created_by, note)
  values (v_p.id, v_id, 'payout', -p_amount, auth.uid(), 'Payout requested');
  if v_settings.payout_fee_naira > 0 then
    insert into public.ledger_entries (promoter_id, payout_id, kind, amount_naira, created_by, note)
    values (v_p.id, v_id, 'payout_fee', -v_settings.payout_fee_naira, auth.uid(), 'Payout processing fee');
  end if;
  return v_id;
end;
$$;
grant execute on function public.request_promoter_payout(numeric) to authenticated;

-- returning a payout now credits whichever account it belonged to
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
  insert into public.ledger_entries (organization_id, promoter_id, payout_id, kind, amount_naira, created_by, note)
  values (v.organization_id, v.promoter_id, p_payout, 'payout_return', v.amount_naira, p_by, 'Payout ' || p_status)
  on conflict do nothing;
  if v.fee_naira > 0 then
    insert into public.ledger_entries (organization_id, promoter_id, payout_id, kind, amount_naira, created_by, note)
    values (v.organization_id, v.promoter_id, p_payout, 'payout_fee_return', v.fee_naira, p_by, 'Payout fee returned')
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
  select pr.status, o.owner_user_id, p.user_id as promoter_user_id into v
  from public.payout_requests pr
  left join public.organizations o on o.id = pr.organization_id
  left join public.promoters p on p.id = pr.promoter_id
  where pr.id = p_payout;
  if coalesce(v.owner_user_id, v.promoter_user_id) is distinct from auth.uid() then
    raise exception 'Only the account owner can cancel this payout.' using errcode = '42501';
  end if;
  if v.status <> 'requested' then
    raise exception 'This payout can no longer be cancelled.';
  end if;
  perform public._return_payout(p_payout, 'cancelled', 'Cancelled by account owner', auth.uid());
end;
$$;
grant execute on function public.cancel_payout(uuid) to authenticated;

-- ---- public: the marketplace ------------------------------------------------
create or replace function public.public_promoter_marketplace()
returns table (
  event_id uuid, slug text, org_slug text, org_name text, name text, date date, start_time text,
  venue text, location text, cover_image text, event_format text,
  commission_pct numeric, commission_cap_naira numeric, access text, min_price_naira numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, o.slug, o.name, e.name, e.date, e.start_time::text, e.venue, e.location, e.cover_image, e.event_format,
         e.promoter_commission_pct, e.promoter_commission_cap_naira, e.promoter_access,
         (select min(t.price_naira) from public.ticket_types t where t.event_id = e.id and t.price_naira > 0)
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.published and e.promoter_program_enabled and not o.is_suspended
    and coalesce(e.end_date, e.date) >= (now() at time zone 'Africa/Lagos')::date
    and exists (select 1 from public.ticket_types t where t.event_id = e.id and t.price_naira > 0)
  order by e.promoter_commission_pct desc, e.date asc;
$$;
grant execute on function public.public_promoter_marketplace() to anon, authenticated;

-- ---- plan limit: active promoters per event --------------------------------
-- Enforced here, not only in the join/invite routes, because organizers can
-- also write event_referrals directly (their own rows, under RLS).
create or replace function public.enforce_promoter_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_max integer;
  v_count integer;
begin
  if new.promoter_id is null or not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.promoter_id is not distinct from new.promoter_id and old.is_active then return new; end if;
  select organization_id into v_org from public.events where id = new.event_id;
  select p.max_promoters_per_event into v_max
  from public.organizer_plans p where p.id = public.effective_plan_id(v_org);
  if v_max is null then return new; end if;
  select count(*) into v_count from public.event_referrals
  where event_id = new.event_id and promoter_id is not null and is_active and id <> new.id;
  if v_count >= v_max then
    raise exception 'This event already has % active promoters, the most its plan allows. Upgrade the plan or pause a promoter first.', v_max
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists event_referrals_promoter_limit on public.event_referrals;
create trigger event_referrals_promoter_limit before insert or update on public.event_referrals
  for each row execute function public.enforce_promoter_limit();

-- ---- the promoter's dashboard ---------------------------------------------
-- One row per event the signed-in promoter is on, with their link stats and
-- what they've earned there (commission earned minus reversals).
create or replace function public.promoter_dashboard()
returns table (
  referral_id uuid, is_active boolean, code text, clicks integer,
  event_id uuid, event_name text, event_slug text, org_slug text, org_name text, event_date date, event_end_date date,
  cover_image text, commission_pct numeric, commission_cap_naira numeric, program_enabled boolean, share_caption text,
  paid_sales bigint, earned_naira numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.is_active, r.code, r.click_count,
         e.id, e.name, e.slug, o.slug, o.name, e.date, e.end_date,
         e.cover_image, e.promoter_commission_pct, e.promoter_commission_cap_naira, e.promoter_program_enabled, e.promoter_share_caption,
         (select count(*) from public.paystack_transactions t where t.referral_id = r.id and t.status = 'success' and t.purpose = 'ticket_purchase'),
         coalesce((select sum(l.amount_naira) from public.ledger_entries l
                   join public.paystack_transactions t on t.id = l.transaction_id
                   where t.referral_id = r.id and l.promoter_id = r.promoter_id
                     and l.kind in ('commission_earned', 'commission_reversal')), 0)
  from public.event_referrals r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = e.organization_id
  where r.promoter_id = public.my_promoter_id()
  order by e.date desc;
$$;
grant execute on function public.promoter_dashboard() to authenticated;
