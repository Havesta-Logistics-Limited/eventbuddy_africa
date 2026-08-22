-- Powers two things: the platform admin's Billing tab (a "comprehensive analysis of
-- my finances") and a per-event price the platform admin can adjust, with the public
-- pricing page reading it live instead of a hardcoded "$49.99" in the page text.
--
-- platform_settings is a singleton row (id is always true) holding the CURRENT price
-- charged to new events going forward. events.price_usd snapshots the price that
-- actually applied to that specific event at creation time — so if the platform admin
-- raises or lowers the price later, past revenue figures don't silently change; only
-- new events pick up the new price. A trigger sets this automatically on insert, so no
-- application code path that creates an event needs to know about billing at all —
-- one source of truth (platform_settings), applied consistently everywhere.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create table if not exists public.platform_settings (
  id boolean primary key default true,
  event_price_usd numeric(10, 2) not null default 49.99,
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id)
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.events add column if not exists price_usd numeric(10, 2);
-- Backfill existing events with the constant price that's applied uniformly so far
-- (event-templates.ts's EVENT_PRICE_USD) — virtual events have always been free.
update public.events set price_usd = case when event_format = 'virtual' then 0 else 49.99 end where price_usd is null;
alter table public.events alter column price_usd set not null;

create or replace function public.set_event_price_usd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_usd is null then
    if new.event_format = 'virtual' then
      new.price_usd := 0;
    else
      select event_price_usd into new.price_usd from public.platform_settings where id = true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_set_price_usd on public.events;
create trigger events_set_price_usd
  before insert on public.events
  for each row execute function public.set_event_price_usd();

alter table public.platform_settings enable row level security;

-- Readable by anyone, including the unauthenticated public pricing page — this is
-- never sensitive data, just the current per-event price.
create policy "platform_settings_select_public" on public.platform_settings
  for select using (true);

-- Only a platform admin can change the price.
create policy "platform_settings_update_platform_admin" on public.platform_settings
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
