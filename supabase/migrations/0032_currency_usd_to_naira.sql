-- Converts every money column in the app from USD to NGN (Naira). This isn't just a
-- rename — this Paystack account has only ever accepted NGN (see src/lib/paystack.ts),
-- so every "USD" price shown so far was silently converted to Naira at charge time via
-- a manually-maintained USD_TO_NGN_RATE env var. Going Naira-native removes that
-- conversion step (and its drift risk) entirely: a ticket priced ₦5,000 now charges
-- exactly ₦5,000, full stop.
--
-- Existing values are multiplied by the rate in effect at the time of this migration
-- (1500) so a currently-configured ticket/event price keeps charging the same real
-- Naira amount it already did — this is a genuine unit conversion, not a relabel.
-- paystack_transactions is the one exception: its USD column was always a display-only
-- figure (the real charge was already in Naira, in charge_amount_minor), so its Naira
-- column is backfilled from that real charged amount instead of the old USD figure.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

-- ---- platform_settings ----
alter table public.platform_settings rename column event_price_usd to event_price_naira;
update public.platform_settings set event_price_naira = round(event_price_naira * 1500);
alter table public.platform_settings alter column event_price_naira set default 74985;

-- ---- events ----
alter table public.events rename column price_usd to price_naira;
update public.events set price_naira = round(price_naira * 1500);

-- ---- ticket_types ----
alter table public.ticket_types rename column price_usd to price_naira;
update public.ticket_types set price_naira = round(price_naira * 1500);

-- ---- discount_codes ----
alter table public.discount_codes rename column min_spend_usd to min_spend_naira;
alter table public.discount_codes rename column max_discount_usd to max_discount_naira;
update public.discount_codes set min_spend_naira = round(min_spend_naira * 1500) where min_spend_naira is not null;
update public.discount_codes set max_discount_naira = round(max_discount_naira * 1500) where max_discount_naira is not null;
-- discount_value is a percentage (unitless) when discount_type = 'percentage', but a
-- flat currency amount when discount_type = 'fixed' — only the latter needs converting.
update public.discount_codes set discount_value = round(discount_value * 1500) where discount_type = 'fixed';

-- ---- paystack_transactions ----
alter table public.paystack_transactions rename column amount_usd to amount_naira;
update public.paystack_transactions set amount_naira = round(charge_amount_minor / 100.0);

-- ---- events_set_price_naira trigger (was events_set_price_usd) ----
drop trigger if exists events_set_price_usd on public.events;
drop function if exists public.set_event_price_usd();

create or replace function public.set_event_price_naira()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_naira is null then
    if new.event_format = 'virtual' then
      new.price_naira := 0;
    else
      select event_price_naira into new.price_naira from public.platform_settings where id = true;
    end if;
  end if;
  return new;
end;
$$;

create trigger events_set_price_naira
  before insert on public.events
  for each row execute function public.set_event_price_naira();

-- ---- public_event_ticket_types RPC (was price_usd) ----
-- The return row type is changing (price_usd -> price_naira), which create or replace
-- can't do in place — Postgres requires the old function gone first.
drop function if exists public.public_event_ticket_types(uuid);

create or replace function public.public_event_ticket_types(p_event_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  price_naira numeric,
  quantity_available integer,
  quantity_sold integer,
  sales_start timestamptz,
  sales_end timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name, t.description, t.price_naira, t.quantity_available, t.quantity_sold, t.sales_start, t.sales_end
  from public.ticket_types t
  join public.events e on e.id = t.event_id
  where t.event_id = p_event_id
    and e.published = true
  order by t.price_naira asc, t.created_at asc;
$$;
grant execute on function public.public_event_ticket_types(uuid) to anon, authenticated;

-- ---- public_validate_discount_code RPC (was max_discount_usd / min_spend_usd / $ message) ----
-- Same story — the return row type is changing (max_discount_usd -> max_discount_naira).
drop function if exists public.public_validate_discount_code(uuid, text, uuid, text);

create or replace function public.public_validate_discount_code(
  p_event_id uuid,
  p_code text,
  p_ticket_type_id uuid,
  p_email text
)
returns table (
  valid boolean,
  error_message text,
  discount_code_id uuid,
  discount_type text,
  discount_value numeric,
  max_discount_naira numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_code record;
  v_ticket_price numeric;
  v_prior_uses integer;
begin
  select d.* into v_code
  from public.discount_codes d
  join public.events e on e.id = d.event_id
  where d.event_id = p_event_id
    and upper(d.code) = upper(p_code)
    and e.published = true
  limit 1;

  if not found then
    return query select false, 'This discount code isn''t valid for this event.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;

  if v_code.starts_at is not null and now() < v_code.starts_at then
    return query select false, 'This discount code isn''t active yet.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_code.ends_at is not null and now() > v_code.ends_at then
    return query select false, 'This discount code has expired.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;

  if v_code.max_uses is not null and v_code.uses_count >= v_code.max_uses then
    return query select false, 'This discount code has already been fully redeemed.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;

  if v_code.ticket_type_ids is not null and not (p_ticket_type_id = any(v_code.ticket_type_ids)) then
    return query select false, 'This discount code doesn''t apply to this ticket type.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;

  select price_naira into v_ticket_price from public.ticket_types where id = p_ticket_type_id and event_id = p_event_id;
  if v_ticket_price is null then
    return query select false, 'This ticket type couldn''t be found.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_code.min_spend_naira is not null and v_ticket_price < v_code.min_spend_naira then
    return query select false, format('This code needs a ticket priced at least ₦%s.', v_code.min_spend_naira)::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;

  if v_code.per_customer_limit = 'single' and p_email is not null and p_email <> '' then
    select count(*) into v_prior_uses
    from public.paystack_transactions pt
    where pt.discount_code_id = v_code.id
      and pt.status = 'success'
      and lower(pt.registrant_data ->> 'email') = lower(p_email);
    if v_prior_uses > 0 then
      return query select false, 'You''ve already used this discount code.'::text, null::uuid, null::text, null::numeric, null::numeric;
      return;
    end if;
  end if;

  return query select true, null::text, v_code.id, v_code.discount_type, v_code.discount_value, v_code.max_discount_naira;
end;
$$;
grant execute on function public.public_validate_discount_code(uuid, text, uuid, text) to anon, authenticated;
