-- Marketing report (2026-10-16): where every visit to an event page came
-- from, and which link and source each sale or registration came through.
--
--   * event_visits: one row per visit (once per browser tab per event) with
--     the link used (public / private / promoter ref / tagged ?src=), the
--     source (utm/src tag, in-app browser, or referring site) and an anonymous
--     browser id for unique-visitor counts. No IP, no personal data. Written
--     only by the server (service role) from the register/view route.
--   * attribution jsonb on paystack_transactions, registrations and leads:
--     the visitor's last non-direct link+source (kept 30 days in their
--     browser), sent with checkout or registration.
--   * event_marketing_report(event, since): visits, unique visitors, free
--     registrations, paid orders and revenue by link and by source, for the
--     event's own team (or a platform admin).

create table if not exists public.event_visits (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  visitor_id text not null check (length(visitor_id) between 8 and 64),
  link_kind text not null check (link_kind in ('public', 'private', 'promoter', 'tagged')),
  link_code text check (link_code is null or length(link_code) <= 60),
  source text not null check (length(source) between 1 and 40),
  source_detail text check (source_detail is null or length(source_detail) <= 120),
  campaign text check (campaign is null or length(campaign) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists event_visits_event_created_idx on public.event_visits (event_id, created_at);
alter table public.event_visits enable row level security;
drop policy if exists "event_visits_select_team" on public.event_visits;
create policy "event_visits_select_team" on public.event_visits for select
  using (event_id in (select public.accessible_event_ids()) or public.is_platform_admin());
revoke insert, update, delete on public.event_visits from anon, authenticated;

alter table public.paystack_transactions add column if not exists attribution jsonb;
alter table public.registrations add column if not exists attribution jsonb;
alter table public.leads add column if not exists attribution jsonb;

create or replace function public.event_marketing_report(p_event uuid, p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
  v_out jsonb;
begin
  if not (p_event in (select public.accessible_event_ids()) or public.is_platform_admin()) then
    raise exception 'Not authorized for this event.' using errcode = '42501';
  end if;

  with visits as (
    select link_kind as kind, coalesce(lower(link_code), '') as code, source, visitor_id
    from public.event_visits where event_id = p_event and created_at >= v_since
  ),
  orders as (
    select coalesce(t.attribution->>'kind', 'unknown') as kind, coalesce(lower(t.attribution->>'code'), '') as code,
           coalesce(t.attribution->>'source', 'unknown') as source,
           t.amount_naira, coalesce(tt.group_size, 1) as people
    from public.paystack_transactions t
    left join public.ticket_types tt on tt.id = t.ticket_type_id
    where t.event_id = p_event and t.purpose = 'ticket_purchase' and t.status = 'success' and t.created_at >= v_since
  ),
  regs as (
    -- free sign-ups only: paid tickets are counted from their payment
    select coalesce(r.attribution->>'kind', 'unknown') as kind, coalesce(lower(r.attribution->>'code'), '') as code,
           coalesce(r.attribution->>'source', 'unknown') as source
    from public.registrations r
    where r.event_id = p_event and r.group_lead_id is null and r.created_at >= v_since
      and r.status not in ('cancelled', 'declined')
      and not exists (select 1 from public.paystack_transactions t where t.registration_id = r.id)
  ),
  by_link as (
    select kind, code,
      sum(v) as visits, sum(u) as visitors, sum(rg) as registrations, sum(o) as orders, sum(p) as tickets, sum(rev) as revenue
    from (
      select kind, code, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by kind, code
      union all select kind, code, 0, 0, count(*), 0, 0, 0 from regs group by kind, code
      union all select kind, code, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by kind, code
    ) x group by kind, code
  ),
  by_source as (
    select source,
      sum(v) as visits, sum(u) as visitors, sum(rg) as registrations, sum(o) as orders, sum(p) as tickets, sum(rev) as revenue
    from (
      select source, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by source
      union all select source, 0, 0, count(*), 0, 0, 0 from regs group by source
      union all select source, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by source
    ) x group by source
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'visits', (select count(*) from visits),
      'visitors', (select count(distinct visitor_id) from visits),
      'registrations', (select count(*) from regs),
      'orders', (select count(*) from orders),
      'tickets', (select coalesce(sum(people), 0) from orders),
      'revenue', (select coalesce(sum(amount_naira), 0) from orders)
    ),
    'by_link', coalesce((select jsonb_agg(to_jsonb(b) order by b.revenue desc, b.visits desc) from by_link b), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(to_jsonb(b) order by b.revenue desc, b.visits desc) from by_source b), '[]'::jsonb),
    'tracking_since', (select min(created_at) from public.event_visits where event_id = p_event)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.event_marketing_report(uuid, timestamptz) from public;
grant execute on function public.event_marketing_report(uuid, timestamptz) to authenticated;
