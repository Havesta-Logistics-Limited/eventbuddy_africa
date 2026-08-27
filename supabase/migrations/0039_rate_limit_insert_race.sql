-- Closes a narrow first-insert race in check_rate_limit: on the very first
-- request for a brand-new key, two concurrent calls could both see "not found"
-- (there's no row yet to lock) and both attempt the insert — the second then hit
-- the primary-key violation, which the caller (src/lib/rate-limit.ts) treats as
-- an infra error and fails OPEN by design. Only the literal first concurrent
-- pair of requests per key was affected, but it's a real, reproducible gap, not
-- a hypothetical one. `insert ... on conflict do nothing` closes the window
-- entirely: whichever call loses the race just falls through to the normal
-- select-for-update path below instead of erroring.

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 0, now())
  on conflict (key) do nothing;

  select * into v_row from public.rate_limits where key = p_key for update;

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
