-- Group (bundle) tickets (2026-10-06): one ticket type can admit several
-- people at one price, e.g. "Squad of 4" or "VIP Table for 6".
--
-- ticket_types.group_size is how many people one purchase admits (1 = an
-- ordinary single ticket). quantity_available / quantity_sold keep counting
-- PURCHASES (bundles), not heads.
--
-- Every person in a group gets their own registration, reference ID and QR, so
-- each checks in on their own. Guests point at the buyer's registration via
-- registrations.group_lead_id; the buyer's own row leaves it null. A refund of
-- the purchase cancels the buyer's row and every row that points at it.
alter table public.ticket_types
  add column if not exists group_size integer not null default 1;
alter table public.ticket_types
  drop constraint if exists ticket_types_group_size_range;
alter table public.ticket_types
  add constraint ticket_types_group_size_range check (group_size between 1 and 20);

alter table public.registrations
  add column if not exists group_lead_id uuid references public.registrations (id) on delete set null;
create index if not exists registrations_group_lead_id_idx on public.registrations (group_lead_id) where group_lead_id is not null;

-- The public registration page lists tickets through this function, so it has
-- to return group_size too. The return row type changes, so drop and recreate
-- (same body as 0032 plus the new column).
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
  sales_end timestamptz,
  group_size integer
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name, t.description, t.price_naira, t.quantity_available, t.quantity_sold, t.sales_start, t.sales_end, t.group_size
  from public.ticket_types t
  join public.events e on e.id = t.event_id
  where t.event_id = p_event_id
    and e.published = true
  order by t.price_naira asc, t.created_at asc;
$$;
grant execute on function public.public_event_ticket_types(uuid) to anon, authenticated;
