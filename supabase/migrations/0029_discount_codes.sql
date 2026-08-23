-- Discount codes for paid tickets — scoped per event, optionally restricted to a
-- subset of that event's ticket types. All validation (scope, date window, total
-- cap, per-customer cap, minimum spend) lives in ONE function
-- (public_validate_discount_code) called by both the public checkout preview and
-- the real ticket-purchase initialize route, so there's a single source of truth
-- for what makes a code valid rather than the same rules duplicated in SQL and
-- TypeScript. Redemption (uses_count) is only counted once a purchase actually
-- succeeds (finalizePaystackTransaction) — a code isn't "used" just because someone
-- started a checkout and abandoned it.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  constraint discount_codes_percentage_max check (discount_type <> 'percentage' or discount_value <= 100),
  -- null = applies to every paid ticket type on the event; otherwise only these.
  ticket_type_ids uuid[],
  -- whether the SAME buyer (matched by email) can redeem this code more than once.
  -- "used once in total, by anyone" is just max_uses = 1 — no separate mode needed.
  per_customer_limit text not null default 'unlimited' check (per_customer_limit in ('single', 'unlimited')),
  max_uses integer check (max_uses is null or max_uses >= 1),
  uses_count integer not null default 0,
  -- the ticket's own listed price must be at least this for the code to apply.
  min_spend_usd numeric(10, 2) check (min_spend_usd is null or min_spend_usd >= 0),
  -- caps the dollar amount actually discounted — mainly relevant to percentage
  -- codes (e.g. "20% off, up to $10"); harmless no-op on a fixed-amount code.
  max_discount_usd numeric(10, 2) check (max_discount_usd is null or max_discount_usd > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per event — "SAVE20" and "save20" are the same code.
create unique index if not exists discount_codes_event_code_key on public.discount_codes (event_id, upper(code));
create index if not exists discount_codes_organization_id_idx on public.discount_codes (organization_id);

alter table public.discount_codes alter column organization_id set default public.current_organization_id();

alter table public.discount_codes enable row level security;

create policy "discount_codes_all_own_org" on public.discount_codes
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));
create policy "discount_codes_select_platform_admin" on public.discount_codes
  for select using (public.is_platform_admin());

-- ---- paystack_transactions: remember which code (if any) a purchase applied ----
alter table public.paystack_transactions
  add column if not exists discount_code_id uuid references public.discount_codes (id) on delete set null;

-- The single source of truth for "is this code usable right now, for this ticket
-- type, by this buyer" — security definer so a public caller can run it without any
-- direct table grants, and reused as-is by the initialize route (via the
-- service-role client) so the real charge is validated by the exact same rules the
-- checkout preview showed, not a re-implementation of them in TypeScript.
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
    from public.paystack_transactions
    where discount_code_id = v_code.id
      and status = 'success'
      and lower(registrant_data ->> 'email') = lower(p_email);
    if v_prior_uses > 0 then
      return query select false, 'You''ve already used this discount code.'::text, null::uuid, null::text, null::numeric, null::numeric;
      return;
    end if;
  end if;

  return query select true, null::text, v_code.id, v_code.discount_type, v_code.discount_value, v_code.max_discount_usd;
end;
$$;
grant execute on function public.public_validate_discount_code(uuid, text, uuid, text) to anon, authenticated;
