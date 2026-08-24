-- Backs a shared rate limiter (src/lib/rate-limit.ts) for public, unauthenticated
-- routes that had no abuse protection at all: forgot-password (inbox bombing),
-- signup (fake account spam), register/leads (free-registration spam that can
-- exhaust a limited-capacity ticket or flood an org's data), ticket-purchase
-- initialize (scripted Paystack transaction spam), and discount-code validation
-- (brute-forcing a short code). A fixed-window counter, not a sliding one — simple,
-- atomic under concurrency via row locking below, and more than sufficient for
-- abuse prevention (this isn't a precision billing system).
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 1,
  window_start timestamptz not null default now()
);

-- No RLS policies — this table is only ever touched server-side via the service-role
-- client (which bypasses RLS entirely), never from the browser or an anon session.
alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row from public.rate_limits where key = p_key for update;

  if not found then
    insert into public.rate_limits (key, count, window_start) values (p_key, 1, now());
    return true;
  end if;

  if now() - v_row.window_start > (p_window_seconds || ' seconds')::interval then
    update public.rate_limits set count = 1, window_start = now() where key = p_key;
    return true;
  end if;

  if v_row.count >= p_limit then
    return false;
  end if;

  update public.rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;
