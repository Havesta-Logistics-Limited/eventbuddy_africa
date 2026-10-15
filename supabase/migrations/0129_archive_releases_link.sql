-- Archiving releases the event's link (2026-10-15). Event links
-- (eventbuddy.africa/{slug}) are unique across every organizer, so an
-- archived event used to keep its name forever. Now archiving saves the link
-- in released_slug and clears it, so another event can use the name; an
-- archived event is off the public site anyway. Unarchiving puts the link back
-- if no other event has taken it meanwhile (otherwise it falls back to the
-- event's id link and the organizer can set a new one).

alter table public.events add column if not exists released_slug text;

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
    -- archived events are off the public site, and their link is freed
    new.published := false;
    if new.slug is not null then
      new.released_slug := new.slug;
      new.slug := null;
    end if;
  elsif new.archived_at is null and old.archived_at is not null then
    -- unarchived: the old link comes back if it's still free
    if new.slug is null and old.released_slug is not null
       and not exists (select 1 from public.events e where e.id <> new.id and lower(e.slug) = lower(old.released_slug)) then
      new.slug := old.released_slug;
    end if;
    new.released_slug := null;
  end if;
  return new;
end;
$$;

-- events archived before this change give their link up now
update public.events set released_slug = slug, slug = null where archived_at is not null and slug is not null;
