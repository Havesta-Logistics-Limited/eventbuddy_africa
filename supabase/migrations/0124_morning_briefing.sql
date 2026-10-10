-- Morning briefing (2026-10-10): a 7am (Lagos) email to every platform admin
-- with yesterday's numbers, anything waiting on them, today's events and any
-- scheduled job that failed. Sent by /api/cron/morning-briefing.
--
--   * platform_settings.morning_briefing_enabled: on by default; switched on
--     the platform portal's Job health tab.
--   * platform_briefing(): the briefing's numbers. Only the server (service
--     role) can call it; it isn't exposed to signed-in users at all.
--
-- "Yesterday" is the previous calendar day in Lagos (or p_day, for a preview),
-- compared with the same weekday a week earlier. Test-mode payments are left
-- out unless asked.

alter table public.platform_settings
  add column if not exists morning_briefing_enabled boolean not null default true;

create or replace function public.platform_briefing(p_include_test boolean default false, p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- the day after the one being reported (p_day lets a preview report any past day)
  v_today date := coalesce(p_day + 1, (now() at time zone 'Africa/Lagos')::date);
  v_from timestamptz := ((v_today - 1)::timestamp at time zone 'Africa/Lagos');
  v_to timestamptz := (v_today::timestamp at time zone 'Africa/Lagos');
  v_wk_from timestamptz := v_from - interval '7 days';
  v_wk_to timestamptz := v_to - interval '7 days';
begin
  return (
    with txn as (
      select t.*
      from public.paystack_transactions t
      where t.created_at >= v_wk_from and t.created_at < v_to
        and (p_include_test or coalesce(t.paystack_event ->> 'domain', '') = 'live')
    ),
    sales as (
      select created_at >= v_from as yday, amount_naira
      from txn
      where purpose in ('ticket_purchase', 'stand_booking') and status in ('success', 'refunded', 'disputed')
        and (created_at >= v_from or created_at < v_wk_to)
    ),
    revenue as (
      select created_at >= v_from as yday, coalesce(platform_fee_naira, 0) as fee
      from txn
      where status in ('success', 'disputed') and (created_at >= v_from or created_at < v_wk_to)
    )
    select jsonb_build_object(
      'day', v_today - 1,
      'include_test', p_include_test,
      'yesterday', jsonb_build_object(
        'sales_naira', coalesce((select sum(amount_naira) from sales where yday), 0),
        'orders', (select count(*) from sales where yday),
        'revenue_naira', coalesce((select sum(fee) from revenue where yday), 0),
        'attendees', (select count(*) from public.registrations where created_at >= v_from and created_at < v_to and status in ('registered', 'checked_in')),
        'checked_in', (select count(*) from public.registrations where checked_in_at >= v_from and checked_in_at < v_to),
        'paid_out_naira', coalesce((select sum(amount_naira) from public.payout_requests where status = 'paid' and paid_at >= v_from and paid_at < v_to), 0)
      ),
      'last_week', jsonb_build_object(
        'sales_naira', coalesce((select sum(amount_naira) from sales where not yday), 0),
        'orders', (select count(*) from sales where not yday),
        'revenue_naira', coalesce((select sum(fee) from revenue where not yday), 0),
        'attendees', (select count(*) from public.registrations where created_at >= v_wk_from and created_at < v_wk_to and status in ('registered', 'checked_in'))
      ),
      'new_organizers', (
        select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'email', o.email) order by o.created_at), '[]'::jsonb)
        from public.organizations o where o.created_at >= v_from and o.created_at < v_to
      ),
      'new_events', (
        select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'organization', o.name, 'date', e.date, 'published', e.published) order by e.created_at), '[]'::jsonb)
        from public.events e join public.organizations o on o.id = e.organization_id
        where e.created_at >= v_from and e.created_at < v_to
      ),
      'today', (
        select coalesce(jsonb_agg(x order by x.start_time nulls last), '[]'::jsonb) from (
          select e.name, e.start_time, e.location, o.name as organization,
                 (select count(*) from public.registrations r where r.event_id = e.id and r.status in ('registered', 'checked_in')) as attendees
          from public.events e join public.organizations o on o.id = e.organization_id
          where e.published and v_today between e.date and coalesce(e.end_date, e.date)
          order by e.start_time nulls last
          limit 10
        ) x
      ),
      'held', jsonb_build_object(
        'organizers_naira', coalesce((select sum(amount_naira) from public.ledger_entries where promoter_id is null), 0),
        'promoters_naira', coalesce((select sum(amount_naira) from public.ledger_entries where promoter_id is not null), 0)
      ),
      'inbox', jsonb_build_object(
        'payouts_requested', (select count(*) from public.payout_requests where status = 'requested'),
        'payouts_requested_naira', coalesce((select sum(amount_naira) from public.payout_requests where status = 'requested'), 0),
        'payouts_stuck', (select count(*) from public.payout_requests where status = 'processing' and decided_at < now() - interval '48 hours'),
        'payouts_failed', (select count(*) from public.payout_requests where status = 'failed' and coalesce(decided_at, requested_at) >= now() - interval '30 days'),
        'verifications_pending', (select count(*) from public.organizer_verification_requests where status = 'pending'),
        'risk_open', (select count(*) from public.risk_alerts where resolved_at is null),
        'disputes_open', (select count(*) from public.paystack_transactions where status = 'disputed' and created_at >= now() - interval '120 days'
                            and (p_include_test or coalesce(paystack_event ->> 'domain', '') = 'live')),
        'managed_new', (select count(*) from public.managed_event_requests where status = 'new'),
        'org_changes', (select count(*) from public.organizations where payout_change_status = 'requested' or name_change_status = 'requested'
                          or login_email_change_status = 'requested' or account_deletion_status = 'requested'),
        'promoter_bank_changes', (select count(*) from public.promoters where payout_change_status = 'requested')
      ),
      'jobs', (
        select coalesce(jsonb_object_agg(j.job, jsonb_build_object('started_at', j.started_at, 'ok', j.ok, 'error', j.error)), '{}'::jsonb)
        from (select distinct on (job) job, started_at, ok, error from public.cron_runs order by job, started_at desc) j
      )
    )
  );
end;
$$;

-- server only: not callable by visitors or signed-in users
revoke all on function public.platform_briefing(boolean, date) from public, anon, authenticated;
grant execute on function public.platform_briefing(boolean, date) to service_role;
