-- Archive events (2026-10-15): put a finished or test event away without
-- losing anything. An archived event is hidden from the organizer's event list
-- (shown under "Archived") and unpublished, so it's off the public site; its
-- sales, attendees, payments and hub data all stay. Unarchiving brings it back
-- (still unpublished until the organizer republishes it).
--
-- An event can be archived once it has ended, or at any time if it has no paid
-- sales: an upcoming event that people hold paid tickets for must stay
-- reachable. Checked here so no client can skip it.

alter table public.events add column if not exists archived_at timestamptz;

create or replace function public.guard_event_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ended boolean;
  v_paid boolean;
begin
  if new.archived_at is not null and old.archived_at is null then
    v_ended := coalesce(new.end_date, new.date) < (now() at time zone coalesce(nullif(new.timezone, ''), 'Africa/Lagos'))::date;
    select exists (
      select 1 from public.paystack_transactions t
      where t.event_id = new.id and t.status in ('success', 'disputed') and t.amount_naira > 0
        and t.purpose in ('ticket_purchase', 'stand_booking')
    ) into v_paid;
    if not v_ended and v_paid then
      raise exception 'This event has paid tickets for an upcoming date, so it can''t be archived until it has ended.' using errcode = 'P0001';
    end if;
    -- archived events are off the public site
    new.published := false;
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_archive on public.events;
create trigger events_guard_archive
  before update of archived_at on public.events
  for each row execute function public.guard_event_archive();

-- Deleting an event with paid sales stays refused (0119); the message now
-- points to archiving, which is what an organizer usually wants.
create or replace function public.protect_events_with_sales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_sales boolean;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select exists (
    select 1 from public.paystack_transactions t
    where t.event_id = old.id and t.status in ('success', 'refunded', 'disputed') and t.amount_naira > 0
  ) into v_has_sales;
  if not v_has_sales then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'This event has paid ticket sales, so it can''t be deleted. Archive it instead: it''s taken off your event list and the public site, and its sales records are kept.' using errcode = '42501';
  end if;
  -- moving an upcoming event into the past would unlock its held money early
  if coalesce(new.end_date, new.date) < current_date and coalesce(new.end_date, new.date) < coalesce(old.end_date, old.date) then
    raise exception 'An event with paid sales can''t be moved to a date in the past.' using errcode = '42501';
  end if;
  return new;
end;
$$;
