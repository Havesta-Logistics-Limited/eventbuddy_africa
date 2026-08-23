-- Fixes a real bug in 0029's public_validate_discount_code: the bare
-- `discount_code_id` reference in the per-customer-limit check was ambiguous
-- between the function's own OUT parameter (returns table (..., discount_code_id
-- uuid, ...)) and paystack_transactions.discount_code_id — Postgres raised
-- "column reference discount_code_id is ambiguous" on every call that reached the
-- per-customer check. Fixed by qualifying it with the table alias.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

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
  max_discount_usd numeric
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

  select price_usd into v_ticket_price from public.ticket_types where id = p_ticket_type_id and event_id = p_event_id;
  if v_ticket_price is null then
    return query select false, 'This ticket type couldn''t be found.'::text, null::uuid, null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_code.min_spend_usd is not null and v_ticket_price < v_code.min_spend_usd then
    return query select false, format('This code needs a ticket priced at least $%s.', v_code.min_spend_usd)::text, null::uuid, null::text, null::numeric, null::numeric;
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

  return query select true, null::text, v_code.id, v_code.discount_type, v_code.discount_value, v_code.max_discount_usd;
end;
$$;
grant execute on function public.public_validate_discount_code(uuid, text, uuid, text) to anon, authenticated;
