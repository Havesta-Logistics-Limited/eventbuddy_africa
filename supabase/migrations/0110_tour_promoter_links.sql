-- Tour-wide promoter links (2026-10-07), step 2 of tours (0109).
--
-- A promoter shares one tour link; the buyer picks a city and the sale is
-- credited to the promoter there. Promoters are joined to every city of a
-- tour when they join one (api/promoters/join), and a city added to the tour
-- later picks up the tour's promoters by itself: when a ?ref= code has no
-- referral row on this city but the same promoter is on another city of the
-- same tour, a row is created for this city on the spot (if this city takes
-- promoters). Invite-only cities are never joined this way: the organizer
-- adds promoters there by hand. Verified-only cities need the Seller badge or
-- higher, the same rule as joining from the marketplace. The plan's promoter
-- limit (enforce_promoter_limit) still applies; if it refuses, the sale
-- simply isn't attributed.

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
  select id into v_id
  from public.event_referrals
  where event_id = p_event_id
    and upper(code) = upper(trim(p_code))
    and is_active
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- tour fallback: only for a promoter's handle, never an organizer's own partner codes
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
    and r.event_id <> p_event_id
    and r.promoter_id is not null
    and r.is_active
    and not p.is_suspended
    and upper(r.code) = upper(trim(p_code))
  limit 1;
  if v_sibling.promoter_id is null then
    return null;
  end if;

  -- verified-only city: Seller badge or higher (migration 0106)
  if v_event.promoter_access = 'verified'
     and coalesce((select badge from public._promoter_stats(v_sibling.promoter_id)), '') not in ('seller', 'reliable', 'captain') then
    return null;
  end if;

  -- a paused row for this promoter on this city means the organizer paused them here
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
    -- plan's promoter limit reached, or the code is taken by a partner link here
    return null;
  end;
  return v_id;
end;
$$;

revoke all on function public.public_resolve_referral(uuid, text) from public;
grant execute on function public.public_resolve_referral(uuid, text) to anon, authenticated;

-- A click on a city the promoter isn't on yet (reached through the tour link)
-- joins them there first, so the click is counted.
create or replace function public.public_count_referral_click(p_event_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.public_resolve_referral(p_event_id, p_code);
  update public.event_referrals
  set click_count = click_count + 1
  where event_id = p_event_id
    and upper(code) = upper(trim(p_code))
    and is_active;
end;
$$;

revoke all on function public.public_count_referral_click(uuid, text) from public;
grant execute on function public.public_count_referral_click(uuid, text) to anon, authenticated;

-- The promoter's dashboard learns which events are part of a tour, so it can
-- offer the one tour link.
drop function if exists public.promoter_dashboard();
create or replace function public.promoter_dashboard()
returns table (
  referral_id uuid, is_active boolean, code text, clicks integer,
  event_id uuid, event_name text, event_slug text, org_slug text, org_name text, event_date date, event_end_date date,
  cover_image text, commission_pct numeric, commission_cap_naira numeric, program_enabled boolean, share_caption text,
  paid_sales bigint, earned_naira numeric,
  tour_id uuid, tour_name text, tour_slug text, tour_city_count bigint
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
                     and l.kind in ('commission_earned', 'commission_reversal')), 0),
         tr.id, tr.name, tr.slug,
         (select count(*) from public.events c where c.tour_id = tr.id and c.published)
  from public.event_referrals r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = e.organization_id
  left join public.tours tr on tr.id = e.tour_id
  where r.promoter_id = public.my_promoter_id()
  order by e.date desc;
$$;
grant execute on function public.promoter_dashboard() to authenticated;
