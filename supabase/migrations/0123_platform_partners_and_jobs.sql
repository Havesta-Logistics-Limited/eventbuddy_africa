-- Platform admin, phase 3 (2026-10-10): promoters, exhibitors, tours and
-- nightly job health, each in its own tab.
--
--   * cron_runs: every scheduled job (/api/cron/*) records each run: when, how
--     long, success or the error, and its summary. Kept for 60 days. Only
--     platform admins can read it; only the server writes it.
--   * platform_promoters(), platform_exhibitors(), platform_tours(): one row
--     per promoter / exhibitor / tour with the numbers that matter.
--   * platform_job_health(): the latest runs of each job.
--
-- All read-only and platform admins only. Test-mode payments are left out of
-- sales numbers unless p_include_test is true, as on the Overview.

-- ---- job runs ---------------------------------------------------------------
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (length(job) between 1 and 60),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  http_status integer,
  summary jsonb,
  error text
);
create index if not exists cron_runs_job_started_idx on public.cron_runs (job, started_at desc);
alter table public.cron_runs enable row level security;
drop policy if exists "cron_runs_select_platform_admin" on public.cron_runs;
create policy "cron_runs_select_platform_admin" on public.cron_runs for select using (public.is_platform_admin());
revoke insert, update, delete on public.cron_runs from anon, authenticated;

create or replace function public.platform_job_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can view job health.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'jobs', (
      select coalesce(jsonb_object_agg(j.job, jsonb_build_object(
        'last', (select to_jsonb(r) from (select started_at, finished_at, ok, http_status, summary, error from public.cron_runs c where c.job = j.job order by started_at desc limit 1) r),
        'last_ok_at', (select max(started_at) from public.cron_runs c where c.job = j.job and c.ok),
        'runs_7d', (select count(*) from public.cron_runs c where c.job = j.job and c.started_at >= now() - interval '7 days'),
        'failures_7d', (select count(*) from public.cron_runs c where c.job = j.job and not c.ok and c.started_at >= now() - interval '7 days')
      )), '{}'::jsonb)
      from (select distinct job from public.cron_runs) j
    ),
    'recent', (
      select coalesce(jsonb_agg(r order by r.started_at desc), '[]'::jsonb) from (
        select job, started_at, finished_at, ok, http_status, summary, error
        from public.cron_runs order by started_at desc limit 30
      ) r
    )
  );
end;
$$;

-- ---- promoters --------------------------------------------------------------
create or replace function public.platform_promoters(p_include_test boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can view promoters.' using errcode = '42501';
  end if;
  return (
    with sales as (
      select er.promoter_id, t.amount_naira, t.created_at
      from public.paystack_transactions t
      join public.event_referrals er on er.id = t.referral_id
      where er.promoter_id is not null
        and t.purpose = 'ticket_purchase' and t.status in ('success', 'refunded', 'disputed')
        and (p_include_test or coalesce(t.paystack_event ->> 'domain', '') = 'live')
    ),
    rows as (
      select
        p.id, p.handle, p.full_name, p.email, p.phone, p.is_suspended as suspended, p.created_at,
        p.payout_bank_name as bank_name, right(coalesce(p.payout_account_number, ''), 4) as account_last4,
        p.payout_change_status = 'requested' as bank_change_waiting,
        (select count(*) from public.event_referrals er where er.promoter_id = p.id) as events,
        (select coalesce(sum(er.click_count), 0) from public.event_referrals er where er.promoter_id = p.id) as clicks,
        (select count(*) from sales s where s.promoter_id = p.id) as orders,
        (select coalesce(sum(s.amount_naira), 0) from sales s where s.promoter_id = p.id) as sales_naira,
        (select max(s.created_at) from sales s where s.promoter_id = p.id) as last_sale_at,
        (select coalesce(sum(l.amount_naira), 0) from public.ledger_entries l where l.promoter_id = p.id and l.kind in ('commission_earned', 'commission_reversal')) as commission_naira,
        (select coalesce(sum(l.amount_naira), 0) from public.ledger_entries l where l.promoter_id = p.id) as balance_naira,
        (select coalesce(sum(pr.amount_naira), 0) from public.payout_requests pr where pr.promoter_id = p.id and pr.status = 'paid') as paid_out_naira,
        (select badge from public._promoter_stats(p.id)) as badge
      from public.promoters p
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'promoters', (select count(*) from rows),
        'active_selling', (select count(*) from rows where orders > 0),
        'suspended', (select count(*) from rows where suspended),
        'sales_naira', (select coalesce(sum(sales_naira), 0) from rows),
        'commission_naira', (select coalesce(sum(commission_naira), 0) from rows),
        'owed_naira', (select coalesce(sum(balance_naira), 0) from rows)
      ),
      'promoters', (select coalesce(jsonb_agg(r order by r.sales_naira desc, r.created_at desc), '[]'::jsonb) from (select * from rows limit 500) r)
    )
  );
end;
$$;

-- ---- exhibitors -------------------------------------------------------------
create or replace function public.platform_exhibitors()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can view exhibitors.' using errcode = '42501';
  end if;
  return (
    with rows as (
      select
        x.id, x.company_name, x.contact_name, x.email, x.phone, x.category, x.status, x.stand_label, x.amount_naira,
        x.applied_at, x.paid_at, x.listed, x.data_removed_at is not null as data_removed,
        st.name as stand_type, e.id as event_id, e.name as event, e.date as event_date,
        o.id as organization_id, o.name as organization,
        (select count(*) from public.exhibitor_leads l where l.exhibitor_id = x.id) as leads,
        (select count(*) from public.registrations r where r.exhibitor_id = x.id and r.status <> 'cancelled') as passes
      from public.exhibitors x
      join public.events e on e.id = x.event_id
      join public.organizations o on o.id = x.organization_id
      left join public.stand_types st on st.id = x.stand_type_id
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'total', (select count(*) from rows),
        'waiting', (select count(*) from rows where status = 'applied'),
        'awaiting_payment', (select count(*) from rows where status = 'approved'),
        'confirmed', (select count(*) from rows where status = 'paid'),
        'stand_sales_naira', (select coalesce(sum(amount_naira), 0) from rows where status = 'paid'),
        'leads', (select coalesce(sum(leads), 0) from rows),
        'events', (select count(distinct event_id) from rows)
      ),
      'exhibitors', (select coalesce(jsonb_agg(r order by r.applied_at desc), '[]'::jsonb) from (select * from rows order by applied_at desc limit 500) r)
    )
  );
end;
$$;

-- ---- tours ------------------------------------------------------------------
create or replace function public.platform_tours(p_include_test boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can view tours.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(t order by t.next_date nulls last, t.created_at desc), '[]'::jsonb)
    from (
      select
        tr.id, tr.name, tr.slug, tr.created_at, o.id as organization_id, o.name as organization, o.slug as organization_slug,
        (select count(*) from public.events e where e.tour_id = tr.id) as cities,
        (select count(*) from public.events e where e.tour_id = tr.id and e.published) as published,
        (select min(e.date) from public.events e where e.tour_id = tr.id and e.published and coalesce(e.end_date, e.date) >= current_date) as next_date,
        (select max(e.date) from public.events e where e.tour_id = tr.id) as last_date,
        (select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'location', e.location, 'date', e.date, 'published', e.published) order by e.date), '[]'::jsonb)
           from public.events e where e.tour_id = tr.id) as stops,
        (select count(*) from public.registrations r join public.events e on e.id = r.event_id
           where e.tour_id = tr.id and r.status in ('registered', 'checked_in')) as attendees,
        (select coalesce(sum(t.amount_naira), 0) from public.paystack_transactions t join public.events e on e.id = t.event_id
           where e.tour_id = tr.id and t.purpose = 'ticket_purchase' and t.status in ('success', 'refunded', 'disputed')
             and (p_include_test or coalesce(t.paystack_event ->> 'domain', '') = 'live')) as sales_naira
      from public.tours tr
      join public.organizations o on o.id = tr.organization_id
      limit 300
    ) t
  );
end;
$$;

revoke all on function public.platform_job_health() from public, anon;
grant execute on function public.platform_job_health() to authenticated;
revoke all on function public.platform_promoters(boolean) from public, anon;
grant execute on function public.platform_promoters(boolean) to authenticated;
revoke all on function public.platform_exhibitors() from public, anon;
grant execute on function public.platform_exhibitors() to authenticated;
revoke all on function public.platform_tours(boolean) from public, anon;
grant execute on function public.platform_tours(boolean) to authenticated;
