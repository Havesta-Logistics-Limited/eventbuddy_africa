-- Promoter badges and verified-only events (2026-10-06), step 4.
--
-- A promoter's badge comes only from real, attributed paid sales: tickets sold
-- through their links (their own purchases excluded), counted live so it can
-- never drift from the sales themselves. Refunded and disputed sales count
-- against the refund rate that Reliable and Captain require.
--
--   Starter   1+ sale
--   Seller    10+ sales
--   Reliable  50+ sales, under 5% refunded or disputed
--   Captain   200+ sales, under 5% refunded or disputed
--
-- An event set to promoter_access = 'verified' (added in 0105) accepts
-- promoters with the Seller badge or higher.
create or replace function public._promoter_stats(p_promoter uuid)
returns table (sales bigint, refunded bigint, badge text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select
      count(*) filter (where pt.status = 'success') as s,
      count(*) filter (where pt.status in ('refunded', 'disputed')) as r
    from public.paystack_transactions pt
    join public.event_referrals er on er.id = pt.referral_id
    join public.promoters p on p.id = er.promoter_id
    where er.promoter_id = p_promoter
      and pt.purpose = 'ticket_purchase'
      and lower(coalesce(pt.registrant_data ->> 'email', '')) <> lower(p.email)
  )
  select s, r,
    case
      when s >= 200 and r * 100 < (s + r) * 5 then 'captain'
      when s >= 50 and r * 100 < (s + r) * 5 then 'reliable'
      when s >= 10 then 'seller'
      when s >= 1 then 'starter'
    end
  from t;
$$;
revoke all on function public._promoter_stats(uuid) from public, anon, authenticated;
grant execute on function public._promoter_stats(uuid) to service_role;

-- the signed-in promoter's own badge and progress
create or replace function public.my_promoter_stats()
returns table (sales bigint, refunded bigint, badge text)
language sql
stable
security definer
set search_path = public
as $$
  select * from public._promoter_stats(public.my_promoter_id());
$$;
grant execute on function public.my_promoter_stats() to authenticated;

-- badges of the promoters on one event, for its organizer
create or replace function public.event_promoter_badges(p_event uuid)
returns table (referral_id uuid, badge text, sales bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, s.badge, s.sales
  from public.event_referrals r
  join public.events e on e.id = r.event_id
  cross join lateral public._promoter_stats(r.promoter_id) s
  where r.event_id = p_event
    and r.promoter_id is not null
    and (e.organization_id in (select public.owned_organization_ids()) or public.is_platform_admin());
$$;
grant execute on function public.event_promoter_badges(uuid) to authenticated;
