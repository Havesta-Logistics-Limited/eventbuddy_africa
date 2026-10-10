-- Platform search and organizer profile (2026-10-10), for the platform admin
-- portal. Both are read-only and platform admins only.
--
-- platform_search(q): one search box across organizers, events, attendees,
--   payments, payouts, promoters and exhibitors. Matches names and emails
--   anywhere, phone numbers by their last 10 digits (so 0803..., +234803...
--   and 234803... all match), and references exactly or by prefix.
--
-- platform_org_profile(org): everything about one organizer on one screen:
--   account details, lifetime numbers, balance, events, payouts, verification,
--   risk alerts, promoters and exhibitors, and a timeline of what happened.
--
-- Bank account numbers are never returned in full: only the last 4 digits.

create or replace function public.platform_search(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_q, ''));
  v_like text;
  v_prefix text;
  v_digits text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can search.' using errcode = '42501';
  end if;
  if length(v_q) < 2 then
    return jsonb_build_object('q', v_q, 'organizations', '[]'::jsonb, 'events', '[]'::jsonb, 'attendees', '[]'::jsonb,
      'payments', '[]'::jsonb, 'payouts', '[]'::jsonb, 'promoters', '[]'::jsonb, 'exhibitors', '[]'::jsonb);
  end if;
  -- % and _ typed by the admin are matched literally
  v_prefix := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_like := '%' || v_prefix;
  -- a phone search: the last 10 digits, when the query is mostly digits
  v_digits := right(regexp_replace(v_q, '\D', '', 'g'), 10);
  if length(v_digits) < 7 or length(regexp_replace(v_q, '[\d\s+()-]', '', 'g')) > 0 then
    v_digits := null;
  end if;

  return jsonb_build_object(
    'q', v_q,
    'organizations', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select o.id, o.name, o.slug, o.email, o.phone, o.payout_verified as verified, o.is_suspended as suspended, o.created_at, o.id as organization_id
        from public.organizations o
        where o.name ilike v_like or o.slug ilike v_like or o.email ilike v_like
           or (v_digits is not null and right(regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'), 10) = v_digits)
        order by (o.name ilike v_q) desc, o.created_at desc
        limit 6
      ) x
    ),
    'events', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select e.id, e.name, e.slug, e.date, e.published, e.location, o.name as organization, e.organization_id
        from public.events e
        join public.organizations o on o.id = e.organization_id
        where e.name ilike v_like or e.slug ilike v_like
        order by e.date desc
        limit 6
      ) x
    ),
    'attendees', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select r.id, r.full_name, r.email, r.phone, r.reference_id, r.status, r.created_at, e.name as event, e.organization_id
        from public.registrations r
        join public.events e on e.id = r.event_id
        where r.full_name ilike v_like or r.email ilike v_like or r.reference_id ilike v_prefix
           or (v_digits is not null and right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 10) = v_digits)
        order by r.created_at desc
        limit 8
      ) x
    ),
    'payments', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select t.id, t.reference, t.amount_naira, t.status, t.purpose, t.created_at, t.registrant_data ->> 'full_name' as buyer,
               t.registrant_data ->> 'email' as buyer_email, o.name as organization, t.organization_id,
               coalesce(t.paystack_event ->> 'domain', '') = 'test' as test
        from public.paystack_transactions t
        left join public.organizations o on o.id = t.organization_id
        where t.reference ilike v_prefix
           or t.registrant_data ->> 'email' ilike v_like
           or t.registrant_data ->> 'full_name' ilike v_like
        order by t.created_at desc
        limit 6
      ) x
    ),
    'payouts', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.amount_naira, p.status, p.requested_at, p.transfer_reference, p.bank_name, p.account_number_last4,
               coalesce(o.name, '@' || pr.handle) as payee, p.organization_id
        from public.payout_requests p
        left join public.organizations o on o.id = p.organization_id
        left join public.promoters pr on pr.id = p.promoter_id
        where p.transfer_reference ilike v_prefix or p.account_name ilike v_like or o.name ilike v_like or pr.handle ilike v_like
        order by p.requested_at desc
        limit 6
      ) x
    ),
    'promoters', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select pr.id, pr.handle, pr.full_name, pr.email, pr.phone, pr.is_suspended as suspended, pr.created_at,
               (select count(*) from public.event_referrals er where er.promoter_id = pr.id) as events
        from public.promoters pr
        where pr.handle ilike v_like or pr.full_name ilike v_like or pr.email ilike v_like
           or (v_digits is not null and right(regexp_replace(coalesce(pr.phone, ''), '\D', '', 'g'), 10) = v_digits)
        order by pr.created_at desc
        limit 6
      ) x
    ),
    'exhibitors', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select x.id, x.company_name, x.contact_name, x.email, x.status, x.stand_label, x.amount_naira, e.name as event, x.organization_id
        from public.exhibitors x
        join public.events e on e.id = x.event_id
        where x.company_name ilike v_like or x.contact_name ilike v_like or x.email ilike v_like
           or (v_digits is not null and right(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), 10) = v_digits)
        order by x.applied_at desc
        limit 6
      ) x
    )
  );
end;
$$;

create or replace function public.platform_org_profile(p_org uuid, p_include_test boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can view organizer profiles.' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org;
  if not found then
    return null;
  end if;

  with txn as (
    select t.*
    from public.paystack_transactions t
    where t.organization_id = p_org
      and (p_include_test or coalesce(t.paystack_event ->> 'domain', '') = 'live')
  ),
  sales as (
    select * from txn where purpose in ('ticket_purchase', 'stand_booking') and status in ('success', 'refunded', 'disputed')
  ),
  regs as (
    select r.* from public.registrations r where r.organization_id = p_org and r.status in ('registered', 'checked_in')
  ),
  bal as (
    select * from public._org_balance(p_org)
  )
  select jsonb_build_object(
    'org', jsonb_build_object(
      'id', v_org.id, 'name', v_org.name, 'slug', v_org.slug, 'created_at', v_org.created_at,
      'email', v_org.email, 'phone', v_org.phone, 'bio', v_org.bio, 'logo_url', v_org.logo_url,
      'login_email', (select u.email from auth.users u where u.id = v_org.owner_user_id),
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = v_org.owner_user_id),
      'suspended', v_org.is_suspended, 'fee_exempt', v_org.is_fee_exempt,
      'verified', v_org.payout_verified, 'verified_at', v_org.payout_verified_at,
      'plan', v_org.plan_id, 'plan_status', v_org.plan_status, 'plan_comped', v_org.plan_comped, 'plan_period_end', v_org.plan_period_end,
      'bank_name', v_org.payout_bank_name, 'account_name', v_org.payout_account_name,
      'account_last4', right(coalesce(v_org.payout_account_number, ''), 4),
      'bank_change_status', v_org.payout_change_status,
      'members', (select count(*) from public.organization_members m where m.organization_id = p_org and m.status = 'active')
    ),
    'stats', jsonb_build_object(
      'sales_naira', coalesce((select sum(amount_naira) from sales), 0),
      'orders', (select count(*) from sales),
      'revenue_naira', coalesce((select sum(coalesce(platform_fee_naira, 0)) from txn where status in ('success', 'disputed')), 0),
      'refunds_naira', coalesce((select sum(amount_naira) from sales where status = 'refunded'), 0),
      'disputes', (select count(*) from sales where status = 'disputed'),
      'attendees', (select count(*) from regs),
      'checked_in', (select count(*) from regs where status = 'checked_in'),
      'events', (select count(*) from public.events where organization_id = p_org),
      'events_published', (select count(*) from public.events where organization_id = p_org and published),
      'events_upcoming', (select count(*) from public.events where organization_id = p_org and published and coalesce(end_date, date) >= current_date),
      'first_sale_at', (select min(created_at) from sales),
      'last_sale_at', (select max(created_at) from sales)
    ),
    'balance', (select jsonb_build_object('total', total_naira, 'pending', pending_naira, 'locked', locked_naira, 'available', available_naira, 'paid_out', paid_out_naira) from bal),
    'events', (
      select coalesce(jsonb_agg(x order by x.date desc), '[]'::jsonb) from (
        select e.id, e.name, e.slug, e.date, e.published, e.location, e.tour_id is not null as tour,
               e.promoter_program_enabled as promoters, e.exhibitors_enabled as exhibitors,
               (select count(*) from regs r where r.event_id = e.id) as attendees,
               (select count(*) from regs r where r.event_id = e.id and r.status = 'checked_in') as checked_in,
               coalesce((select sum(s.amount_naira) from sales s where s.event_id = e.id), 0) as sales_naira
        from public.events e
        where e.organization_id = p_org
        order by e.date desc
        limit 40
      ) x
    ),
    'payouts', (
      select coalesce(jsonb_agg(x order by x.requested_at desc), '[]'::jsonb) from (
        select p.id, p.amount_naira, p.fee_naira, p.status, p.requested_at, p.decided_at, p.paid_at, p.bank_name,
               p.account_number_last4, p.failure_reason, p.decision_note
        from public.payout_requests p
        where p.organization_id = p_org
        order by p.requested_at desc
        limit 20
      ) x
    ),
    'verification', (
      select to_jsonb(x) from (
        select v.status, v.full_name, v.business_name, v.id_type, v.cac_number, v.created_at, v.decided_at, v.decline_reason
        from public.organizer_verification_requests v
        where v.organization_id = p_org
        order by v.created_at desc
        limit 1
      ) x
    ),
    'risk', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select a.id, a.kind, a.tickets, a.created_at, a.resolved_at, e.name as event
        from public.risk_alerts a
        left join public.events e on e.id = a.event_id
        where a.organization_id = p_org
        order by a.created_at desc
        limit 10
      ) x
    ),
    'promoters', (
      select coalesce(jsonb_agg(x order by x.sales_naira desc), '[]'::jsonb) from (
        select pr.id, pr.handle, pr.full_name,
               count(s.id) as orders,
               coalesce(sum(s.amount_naira), 0) as sales_naira
        from public.event_referrals er
        join public.promoters pr on pr.id = er.promoter_id
        left join sales s on s.referral_id = er.id
        where er.organization_id = p_org
        group by pr.id, pr.handle, pr.full_name
        order by coalesce(sum(s.amount_naira), 0) desc
        limit 8
      ) x
    ),
    'exhibitors', jsonb_build_object(
      'total', (select count(*) from public.exhibitors where organization_id = p_org),
      'confirmed', (select count(*) from public.exhibitors where organization_id = p_org and status = 'paid'),
      'pending', (select count(*) from public.exhibitors where organization_id = p_org and status in ('applied', 'approved')),
      'stand_sales_naira', coalesce((select sum(amount_naira) from sales where purpose = 'stand_booking'), 0)
    ),
    'timeline', (
      select coalesce(jsonb_agg(t order by t.at desc), '[]'::jsonb) from (
        select * from (
          select v_org.created_at as at, 'joined' as kind, 'Joined eventbuddy' as title, null::text as detail
          union all
          select e.created_at, 'event', 'Created an event', e.name from public.events e where e.organization_id = p_org
          union all
          select min(s.created_at), 'first_sale', 'First ticket sale', null from sales s having count(*) > 0
          union all
          select s.created_at, 'refund', case s.status when 'refunded' then 'Refund' else 'Payment disputed' end,
                 s.reference || ' · ₦' || to_char(s.amount_naira, 'FM999,999,999,990')
          from sales s where s.status in ('refunded', 'disputed')
          union all
          select p.requested_at, 'payout', 'Requested a payout', '₦' || to_char(p.amount_naira, 'FM999,999,999,990')
          from public.payout_requests p where p.organization_id = p_org
          union all
          select coalesce(p.paid_at, p.decided_at), 'payout_' || p.status,
                 case p.status when 'paid' then 'Payout paid' when 'failed' then 'Payout failed' when 'rejected' then 'Payout rejected' else 'Payout cancelled' end,
                 '₦' || to_char(p.amount_naira, 'FM999,999,999,990') || coalesce(' · ' || nullif(coalesce(p.failure_reason, p.decision_note), ''), '')
          from public.payout_requests p
          where p.organization_id = p_org and p.status in ('paid', 'failed', 'rejected', 'cancelled') and coalesce(p.paid_at, p.decided_at) is not null
          union all
          select v.created_at, 'verification', 'Asked to be verified', v.full_name from public.organizer_verification_requests v where v.organization_id = p_org
          union all
          select v.decided_at, 'verification_' || v.status, case v.status when 'approved' then 'Verified' else 'Verification declined' end, v.decline_reason
          from public.organizer_verification_requests v where v.organization_id = p_org and v.decided_at is not null
          union all
          select a.created_at, 'risk', case a.kind when 'cap_near' then 'Nearing the sales limit' when 'cap_reached' then 'Hit the sales limit' else 'Sudden spike in sales' end,
                 coalesce(e.name || ' · ', '') || a.tickets || ' tickets'
          from public.risk_alerts a left join public.events e on e.id = a.event_id where a.organization_id = p_org
        ) u
        where u.at is not null
        order by u.at desc
        limit 40
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_search(text) from public, anon;
grant execute on function public.platform_search(text) to authenticated;
revoke all on function public.platform_org_profile(uuid, boolean) from public, anon;
grant execute on function public.platform_org_profile(uuid, boolean) to authenticated;
