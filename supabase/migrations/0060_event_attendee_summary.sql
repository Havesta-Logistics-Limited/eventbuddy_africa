-- Powers the register page's "Hosted By" section — a real attendee count and a
-- bounded sample of real names (never the full list, to keep exposure limited even
-- though this is public data organizers already show at the door). Physical events
-- read from registrations (excluding cancelled), virtual ones from leads, matching
-- every other place in this app that branches on event_format for these two tables.
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
    select count(*) into v_count from public.leads where event_id = p_event_id;
    select coalesce(array_agg(full_name), array[]::text[]) into v_names
    from (
      select trim(first_name || ' ' || last_name) as full_name
      from public.leads
      where event_id = p_event_id
      order by created_at asc
      limit 8
    ) s;
  else
    select count(*) into v_count from public.registrations where event_id = p_event_id and status <> 'cancelled';
    select coalesce(array_agg(full_name), array[]::text[]) into v_names
    from (
      select full_name
      from public.registrations
      where event_id = p_event_id and status <> 'cancelled'
      order by created_at asc
      limit 8
    ) s;
  end if;

  return query select v_count, v_names;
end;
$$;

grant execute on function public.public_event_attendee_summary(uuid) to anon, authenticated;
