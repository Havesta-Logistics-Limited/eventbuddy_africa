-- Platform marketing report (2026-10-16): the event Marketing report (0132)
-- across every event, for platform admins: totals, sources, link types and
-- the events drawing the most visits and sales. Test-mode payments (Paystack
-- domain 'test') are left out unless asked for, like the Overview.

create or replace function public.platform_marketing_report(p_since timestamptz default null, p_include_test boolean default false)
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
  if not public.is_platform_admin() then
    raise exception 'Platform admins only.' using errcode = '42501';
  end if;

  with visits as (
    select event_id, link_kind as kind, source, visitor_id
    from public.event_visits where created_at >= v_since
  ),
  orders as (
    select t.event_id, coalesce(t.attribution->>'kind', 'unknown') as kind, coalesce(t.attribution->>'source', 'unknown') as source,
           t.amount_naira, coalesce(tt.group_size, 1) as people
    from public.paystack_transactions t
    left join public.ticket_types tt on tt.id = t.ticket_type_id
    where t.purpose = 'ticket_purchase' and t.status = 'success' and t.created_at >= v_since
      and (p_include_test or coalesce(t.paystack_event ->> 'domain', '') = 'live')
  ),
  regs as (
    select r.event_id, coalesce(r.attribution->>'kind', 'unknown') as kind, coalesce(r.attribution->>'source', 'unknown') as source
    from public.registrations r
    where r.group_lead_id is null and r.created_at >= v_since and r.status not in ('cancelled', 'declined')
      and not exists (select 1 from public.paystack_transactions t where t.registration_id = r.id)
  ),
  agg_source as (
    select source, sum(v) visits, sum(u) visitors, sum(rg) registrations, sum(o) orders, sum(p) tickets, sum(rev) revenue
    from (
      select source, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by source
      union all select source, 0, 0, count(*), 0, 0, 0 from regs group by source
      union all select source, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by source
    ) x group by source
  ),
  agg_kind as (
    select kind, sum(v) visits, sum(u) visitors, sum(rg) registrations, sum(o) orders, sum(p) tickets, sum(rev) revenue
    from (
      select kind, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by kind
      union all select kind, 0, 0, count(*), 0, 0, 0 from regs group by kind
      union all select kind, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by kind
    ) x group by kind
  ),
  agg_event as (
    select event_id, sum(v) visits, sum(u) visitors, sum(rg) registrations, sum(o) orders, sum(p) tickets, sum(rev) revenue
    from (
      select event_id, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by event_id
      union all select event_id, 0, 0, count(*), 0, 0, 0 from regs group by event_id
      union all select event_id, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by event_id
    ) x group by event_id
  ),
  top_source as (
    select distinct on (event_id) event_id, source
    from (select event_id, source, count(*) n from visits group by event_id, source) s
    order by event_id, n desc
  ),
  events_out as (
    select a.*, e.name, e.slug, e.date, e.visibility, o.name as org_name, o.id as org_id, ts.source as top_source
    from agg_event a
    join public.events e on e.id = a.event_id
    join public.organizations o on o.id = e.organization_id
    left join top_source ts on ts.event_id = a.event_id
    where a.visits > 0 or a.orders > 0 or a.registrations > 0
    order by a.revenue desc, a.visits desc
    limit 100
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'visits', (select count(*) from visits),
      'visitors', (select count(distinct visitor_id) from visits),
      'registrations', (select count(*) from regs),
      'orders', (select count(*) from orders),
      'tickets', (select coalesce(sum(people), 0) from orders),
      'revenue', (select coalesce(sum(amount_naira), 0) from orders),
      'tracked', (select count(*) from orders where kind <> 'unknown') + (select count(*) from regs where kind <> 'unknown'),
      'events', (select count(distinct event_id) from visits)
    ),
    'by_source', coalesce((select jsonb_agg(to_jsonb(b) order by b.revenue desc, b.visits desc) from agg_source b), '[]'::jsonb),
    'by_kind', coalesce((select jsonb_agg(to_jsonb(b) order by b.revenue desc, b.visits desc) from agg_kind b), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(b)) from events_out b), '[]'::jsonb),
    'tracking_since', (select min(created_at) from public.event_visits),
    'include_test', p_include_test
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.platform_marketing_report(timestamptz, boolean) from public;
grant execute on function public.platform_marketing_report(timestamptz, boolean) to authenticated;
