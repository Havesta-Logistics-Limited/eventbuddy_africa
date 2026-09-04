-- Three related registration-lifecycle features, sharing one status expansion:
--
-- 1. Approval-required registration — organizer toggle; when on, a new registration
--    starts 'pending' instead of 'registered' until the organizer approves/declines it.
-- 2. Waitlists — when a capacity-limited ticket type is sold out and the organizer has
--    turned this on, a new registration is captured as 'waitlisted' instead of being
--    rejected outright; the organizer promotes people manually as spots free up
--    (deliberately not fully automatic — that would need a background job/trigger this
--    pass doesn't add).
-- 3. Per-attendee guest-list opt-out — an attendee can ask not to appear in the public
--    "N Going" name sample (migration 0060); the aggregate count still includes them
--    (not personally identifying on its own), only the name list respects this.

alter table public.registrations drop constraint if exists registrations_status_check;
alter table public.registrations add constraint registrations_status_check
  check (status in ('registered', 'checked_in', 'cancelled', 'pending', 'waitlisted', 'declined'));

alter table public.leads add column if not exists status text not null default 'registered'
  check (status in ('registered', 'pending', 'waitlisted', 'declined'));

-- Leads never persisted which ticket type a self-service registration picked (only
-- registrations did) — the free-registration route just incremented quantity_sold
-- in the moment and moved on. That's no longer enough once a lead can sit as
-- 'pending' or 'waitlisted': approving/declining/promoting it later needs to know
-- which ticket type's capacity to adjust.
alter table public.leads add column if not exists ticket_type_id uuid references public.ticket_types (id) on delete set null;

alter table public.events add column if not exists requires_approval boolean not null default false;
alter table public.events add column if not exists waitlist_enabled boolean not null default false;

alter table public.registrations add column if not exists hide_from_guest_list boolean not null default false;
alter table public.leads add column if not exists hide_from_guest_list boolean not null default false;

-- Mirrors increment_ticket_sold (0038) exactly — the counterpart used when declining a
-- pending registration that had already reserved a seat, or promoting/cancelling one.
create or replace function public.decrement_ticket_sold(p_ticket_type_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.ticket_types
  set quantity_sold = greatest(0, quantity_sold - 1)
  where id = p_ticket_type_id;
end;
$$;

-- Redefines public_event_attendee_summary (0060) to only ever count/name genuinely
-- confirmed attendees (never pending/waitlisted/declined) and to respect the new
-- opt-out flag on the name sample specifically.
create or replace function public.public_event_attendee_summary(p_event_id uuid)
returns table (total_count integer, sample_names text[])
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_format text;
  v_published boolean;
  v_count integer;
  v_names text[];
begin
  select event_format, published into v_format, v_published from public.events where id = p_event_id;
  if v_format is null or not v_published then
    return query select 0, array[]::text[];
    return;
  end if;

  if v_format = 'virtual' then
    select count(*) into v_count from public.leads where event_id = p_event_id and status = 'registered';
    select coalesce(array_agg(full_name), array[]::text[]) into v_names
    from (
      select trim(first_name || ' ' || last_name) as full_name
      from public.leads
      where event_id = p_event_id and status = 'registered' and not hide_from_guest_list
      order by created_at asc
      limit 8
    ) s;
  else
    select count(*) into v_count from public.registrations where event_id = p_event_id and status in ('registered', 'checked_in');
    select coalesce(array_agg(full_name), array[]::text[]) into v_names
    from (
      select full_name
      from public.registrations
      where event_id = p_event_id and status in ('registered', 'checked_in') and not hide_from_guest_list
      order by created_at asc
      limit 8
    ) s;
  end if;

  return query select v_count, v_names;
end;
$$;

grant execute on function public.public_event_attendee_summary(uuid) to anon, authenticated;
