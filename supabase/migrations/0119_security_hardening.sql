-- Security hardening (2026-10-07), from the pre-launch audit.
--
-- 1. Creating an organization from the browser could set protected money and
--    plan columns (verified, fee-exempt, plan, bank account...). The 0103/0104
--    protections only ran on UPDATE. Now an INSERT by a signed-in user always
--    starts from the safe defaults; sign-up itself runs as the service role.
-- 2. Rows on ~18 event tables only checked that organization_id was the
--    caller's own, never that event_id belonged to that same organization, so
--    an organizer could add ticket types, discount codes, stand types,
--    promoter links etc. to another organization's event. A trigger now
--    requires the event to belong to the row's organization.
-- 3. An organizer could unlock held ticket money early (or erase sales
--    history) by deleting an event with paid sales or moving it into the
--    past. Both are refused from the browser now.
-- 4. Exhibitor staff passes: the per-stand limit is enforced in the database,
--    so parallel requests can't exceed it.
-- 5. The tour promoter fallback also requires the referral's organization to
--    match the event's.

-- ---- 1. organization inserts start from safe defaults ----------------------
create or replace function public.protect_organization_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_platform_admin() then
    new.is_fee_exempt := false;
    new.is_suspended := false;
    new.paystack_subaccount_code := null;
    new.payout_bank_code := null;
    new.payout_bank_name := null;
    new.payout_account_number := null;
    new.payout_account_name := null;
    new.payout_change_status := 'none';
    new.payout_change_requested_at := null;
    new.payout_change_approved_at := null;
    new.payout_verified := false;
    new.payout_verified_at := null;
    new.payout_recipient_code := null;
    new.plan_id := 'launch';
    new.plan_status := 'active';
    new.plan_period_end := null;
    new.plan_comped := false;
    new.paystack_customer_code := null;
    new.paystack_subscription_code := null;
    new.paystack_subscription_token := null;
  end if;
  return new;
end;
$$;
drop trigger if exists organizations_protect_insert on public.organizations;
create trigger organizations_protect_insert
  before insert on public.organizations
  for each row execute function public.protect_organization_insert();

-- ---- 2. a row's event must belong to the row's organization ----------------
create or replace function public.enforce_event_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_id is not null
     and not exists (select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id) then
    raise exception 'event belongs to another organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'destinations', 'discount_codes', 'event_announcements', 'event_guests', 'event_hub_members',
    'event_one_on_one_requests', 'event_polls', 'event_questions', 'event_referrals', 'event_sessions',
    'event_speakers', 'exhibitors', 'leads', 'organization_members', 'registrations', 'staff',
    'stand_types', 'ticket_types'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_same_org_event', t);
    execute format(
      'create trigger %I before insert or update of event_id, organization_id on public.%I for each row execute function public.enforce_event_same_org()',
      t || '_same_org_event', t
    );
  end loop;
end $$;

-- ---- 3. no deleting or back-dating events that have paid sales -------------
create or replace function public.protect_events_with_sales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_sales boolean;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select exists (
    select 1 from public.paystack_transactions t
    where t.event_id = old.id and t.status in ('success', 'refunded', 'disputed') and t.amount_naira > 0
  ) into v_has_sales;
  if not v_has_sales then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'This event has paid ticket sales, so it can''t be deleted. Contact eventbuddy support if it was cancelled.' using errcode = '42501';
  end if;
  -- moving an upcoming event into the past would unlock its held money early
  if coalesce(new.end_date, new.date) < current_date and coalesce(new.end_date, new.date) < coalesce(old.end_date, old.date) then
    raise exception 'An event with paid sales can''t be moved to a date in the past.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists events_protect_sales on public.events;
create trigger events_protect_sales
  before delete or update of date, end_date on public.events
  for each row execute function public.protect_events_with_sales();

-- ---- 4. exhibitor staff passes can't exceed the stand's allowance -----------
create or replace function public.enforce_exhibitor_pass_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.exhibitor_id is null or new.status = 'cancelled' then
    return new;
  end if;
  -- lock the exhibitor so concurrent inserts are counted one after another
  select coalesce(s.passes_included, 0) into v_limit
  from public.exhibitors x
  left join public.stand_types s on s.id = x.stand_type_id
  where x.id = new.exhibitor_id
  for update of x;
  select count(*) into v_count from public.registrations r where r.exhibitor_id = new.exhibitor_id and r.status <> 'cancelled';
  if v_count >= coalesce(v_limit, 0) then
    raise exception 'staff pass limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists registrations_exhibitor_pass_limit on public.registrations;
create trigger registrations_exhibitor_pass_limit
  before insert on public.registrations
  for each row execute function public.enforce_exhibitor_pass_limit();

-- ---- 5. tour promoter fallback: the referral's org must be the event's ------
create or replace function public.public_resolve_referral(p_event_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_event record;
  v_sibling record;
begin
  select r.id into v_id
  from public.event_referrals r
  join public.events e on e.id = r.event_id
  where r.event_id = p_event_id
    and r.organization_id = e.organization_id
    and upper(r.code) = upper(trim(p_code))
    and r.is_active
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select e.id, e.organization_id, e.tour_id, e.published, e.promoter_program_enabled, e.promoter_commission_pct, e.promoter_access
    into v_event
  from public.events e
  where e.id = p_event_id;
  if v_event.tour_id is null or not v_event.published or not v_event.promoter_program_enabled
     or v_event.promoter_access = 'invite' then
    return null;
  end if;

  select r.promoter_id, p.handle, p.full_name, p.email, p.phone
    into v_sibling
  from public.event_referrals r
  join public.events e on e.id = r.event_id
  join public.promoters p on p.id = r.promoter_id
  where e.tour_id = v_event.tour_id
    and r.organization_id = v_event.organization_id
    and r.event_id <> p_event_id
    and r.promoter_id is not null
    and r.is_active
    and not p.is_suspended
    and upper(r.code) = upper(trim(p_code))
  limit 1;
  if v_sibling.promoter_id is null then
    return null;
  end if;

  if v_event.promoter_access = 'verified'
     and coalesce((select badge from public._promoter_stats(v_sibling.promoter_id)), '') not in ('seller', 'reliable', 'captain') then
    return null;
  end if;

  if exists (select 1 from public.event_referrals where event_id = p_event_id and promoter_id = v_sibling.promoter_id) then
    return null;
  end if;

  begin
    insert into public.event_referrals (organization_id, event_id, promoter_id, code, partner_name, partner_email, partner_phone, commission_type, commission_rate)
    values (v_event.organization_id, p_event_id, v_sibling.promoter_id, v_sibling.handle,
            v_sibling.full_name || ' (@' || v_sibling.handle || ')', v_sibling.email, v_sibling.phone,
            'percent_net', v_event.promoter_commission_pct)
    returning id into v_id;
  exception when others then
    return null;
  end;
  return v_id;
end;
$$;
revoke all on function public.public_resolve_referral(uuid, text) from public;
grant execute on function public.public_resolve_referral(uuid, text) to anon, authenticated;
