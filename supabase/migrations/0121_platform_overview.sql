-- Platform Overview (2026-10-10): one call that returns everything the
-- platform admin's Overview tab shows, computed in the database so the browser
-- never has to download every payment and ledger row.
--
--   * "Needs your action": payout requests, verification requests, risk
--     alerts, disputes, managed-event requests and organizer change requests.
--   * Headline numbers for the chosen period, with the previous period beside
--     them: ticket and stand sales, eventbuddy revenue, attendees, organizers,
--     events.
--   * Money flow: sold, eventbuddy revenue, paid out, and what eventbuddy is
--     holding for organizers and promoters right now.
--   * A daily series for the charts, top organizers, and events in the next 7 days.
--
-- Test-mode payments (Paystack domain 'test') are left out unless
-- p_include_test is true, so live numbers are never inflated by testing.
-- Only platform admins can call it.

create or replace function public.platform_overview(p_days integer default 30, p_include_test boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_now timestamptz := now();
  v_since timestamptz;
  v_prev timestamptz;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can view the overview.' using errcode = '42501';
  end if;
  v_since := v_now - make_interval(days => v_days);
  v_prev := v_since - make_interval(days => v_days);

  with txn as (
    select t.*
    from public.paystack_transactions t
    where (p_include_test or coalesce(t.paystack_event ->> 'domain', '') = 'live')
      and t.created_at >= v_prev
  ),
  -- money in: ticket and stand sales (refunded and disputed still count as sold)
  sales as (
    select
      created_at >= v_since as cur,
      amount_naira,
      purpose,
      status
    from txn
    where purpose in ('ticket_purchase', 'stand_booking') and status in ('success', 'refunded', 'disputed')
  ),
  -- eventbuddy's own revenue: the fee on every successful charge (ticket fees,
  -- stand fees, event publishing and plan subscriptions)
  revenue as (
    select created_at >= v_since as cur, coalesce(platform_fee_naira, 0) as fee
    from txn
    where status in ('success', 'disputed')
  ),
  regs as (
    select created_at >= v_since as cur
    from public.registrations
    where created_at >= v_prev and status in ('registered', 'checked_in')
  ),
  orgs as (
    select created_at >= v_since as cur from public.organizations where created_at >= v_prev
  ),
  evs as (
    select created_at >= v_since as cur from public.events where created_at >= v_prev
  ),
  paid as (
    select paid_at >= v_since as cur, amount_naira
    from public.payout_requests
    where status = 'paid' and paid_at >= v_prev
  )
  select jsonb_build_object(
    'days', v_days,
    'include_test', p_include_test,
    'generated_at', v_now,
    'kpis', jsonb_build_object(
      'sales_naira', jsonb_build_object(
        'cur', coalesce((select sum(amount_naira) from sales where cur), 0),
        'prev', coalesce((select sum(amount_naira) from sales where not cur), 0)),
      'paid_orders', jsonb_build_object(
        'cur', (select count(*) from sales where cur),
        'prev', (select count(*) from sales where not cur)),
      'revenue_naira', jsonb_build_object(
        'cur', coalesce((select sum(fee) from revenue where cur), 0),
        'prev', coalesce((select sum(fee) from revenue where not cur), 0)),
      'attendees', jsonb_build_object(
        'cur', (select count(*) from regs where cur),
        'prev', (select count(*) from regs where not cur)),
      'new_organizers', jsonb_build_object(
        'cur', (select count(*) from orgs where cur),
        'prev', (select count(*) from orgs where not cur)),
      'new_events', jsonb_build_object(
        'cur', (select count(*) from evs where cur),
        'prev', (select count(*) from evs where not cur)),
      'refunds_naira', coalesce((select sum(amount_naira) from sales where cur and status = 'refunded'), 0),
      'disputes_naira', coalesce((select sum(amount_naira) from sales where cur and status = 'disputed'), 0)
    ),
    'money', jsonb_build_object(
      'sold_naira', coalesce((select sum(amount_naira) from sales where cur), 0),
      'revenue_naira', coalesce((select sum(fee) from revenue where cur), 0),
      'paid_out_naira', coalesce((select sum(amount_naira) from paid where cur), 0),
      'paid_out_all_time_naira', coalesce((select sum(amount_naira) from public.payout_requests where status = 'paid'), 0),
      -- what eventbuddy holds right now: every organizer's and promoter's balance
      'held_organizers_naira', coalesce((select sum(amount_naira) from public.ledger_entries where promoter_id is null), 0),
      'held_promoters_naira', coalesce((select sum(amount_naira) from public.ledger_entries where promoter_id is not null), 0),
      'held_funds_enabled', coalesce((select held_funds_enabled from public.platform_settings where id), false)
    ),
    'inbox', jsonb_build_object(
      'payouts_requested', (select count(*) from public.payout_requests where status = 'requested'),
      'payouts_requested_naira', coalesce((select sum(amount_naira) from public.payout_requests where status = 'requested'), 0),
      'payouts_stuck', (select count(*) from public.payout_requests where status = 'processing' and decided_at < v_now - interval '48 hours'),
      'payouts_failed', (select count(*) from public.payout_requests where status = 'failed' and coalesce(decided_at, requested_at) >= v_now - interval '30 days'),
      'verifications_pending', (select count(*) from public.organizer_verification_requests where status = 'pending'),
      'risk_open', (select count(*) from public.risk_alerts where resolved_at is null),
      'disputes_open', (select count(*) from public.paystack_transactions where status = 'disputed' and created_at >= v_now - interval '120 days'
                          and (p_include_test or coalesce(paystack_event ->> 'domain', '') = 'live')),
      'managed_new', (select count(*) from public.managed_event_requests where status = 'new'),
      'bank_changes', (select count(*) from public.organizations where payout_change_status = 'requested'),
      'name_changes', (select count(*) from public.organizations where name_change_status = 'requested'),
      'email_changes', (select count(*) from public.organizations where login_email_change_status = 'requested'),
      'deletions', (select count(*) from public.organizations where account_deletion_status = 'requested')
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'sales_naira', coalesce(s.sales, 0),
        'revenue_naira', coalesce(r.fee, 0),
        'attendees', coalesce(a.n, 0)
      ) order by d.day), '[]'::jsonb)
      from (
        select generate_series((v_since at time zone 'Africa/Lagos')::date, (v_now at time zone 'Africa/Lagos')::date, interval '1 day')::date as day
      ) d
      left join (
        select (created_at at time zone 'Africa/Lagos')::date as day, sum(amount_naira) as sales
        from txn
        where purpose in ('ticket_purchase', 'stand_booking') and status in ('success', 'refunded', 'disputed') and created_at >= v_since
        group by 1
      ) s on s.day = d.day
      left join (
        select (created_at at time zone 'Africa/Lagos')::date as day, sum(coalesce(platform_fee_naira, 0)) as fee
        from txn
        where status in ('success', 'disputed') and created_at >= v_since
        group by 1
      ) r on r.day = d.day
      left join (
        select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as n
        from public.registrations
        where created_at >= v_since and status in ('registered', 'checked_in')
        group by 1
      ) a on a.day = d.day
    ),
    'top_organizers', (
      select coalesce(jsonb_agg(x order by x.sales_naira desc), '[]'::jsonb)
      from (
        select o.id, o.name, o.payout_verified as verified, sum(t.amount_naira) as sales_naira, count(*) as orders
        from txn t
        join public.organizations o on o.id = t.organization_id
        where t.purpose in ('ticket_purchase', 'stand_booking') and t.status in ('success', 'refunded', 'disputed') and t.created_at >= v_since
        group by o.id, o.name, o.payout_verified
        order by sum(t.amount_naira) desc
        limit 5
      ) x
    ),
    'upcoming', (
      select coalesce(jsonb_agg(x order by x.date, x.start_time nulls last), '[]'::jsonb)
      from (
        select e.id, e.name, e.slug, e.date, e.start_time, e.location, o.name as organization,
               (select count(*) from public.registrations r where r.event_id = e.id and r.status in ('registered', 'checked_in')) as attendees
        from public.events e
        join public.organizations o on o.id = e.organization_id
        where e.published
          and e.date between (v_now at time zone 'Africa/Lagos')::date and (v_now at time zone 'Africa/Lagos')::date + 7
        order by e.date, e.start_time nulls last
        limit 8
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_overview(integer, boolean) from public, anon;
grant execute on function public.platform_overview(integer, boolean) to authenticated;
