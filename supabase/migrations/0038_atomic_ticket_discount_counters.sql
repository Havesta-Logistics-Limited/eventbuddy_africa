-- Two concurrent successful payments for the same ticket type or discount code
-- (webhook + client verify racing, or two buyers checking out at once) could
-- previously both read the same quantity_sold/uses_count, both add 1, and lose
-- one increment — a classic lost-update race letting the last unit of a capped
-- ticket type or the last use of a max_uses=1 code be sold/redeemed more than
-- once. A single guarded UPDATE is atomic at the row-lock level: two concurrent
-- callers serialize on the row, and the second one re-evaluates the WHERE
-- clause against the already-updated row, so the cap genuinely holds under
-- concurrency instead of just in the common case.

create or replace function public.increment_ticket_sold(p_ticket_type_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.ticket_types
  set quantity_sold = quantity_sold + 1
  where id = p_ticket_type_id
    and (quantity_available is null or quantity_sold < quantity_available);
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.increment_discount_uses(p_discount_code_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.discount_codes
  set uses_count = uses_count + 1
  where id = p_discount_code_id
    and (max_uses is null or uses_count < max_uses);
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;
