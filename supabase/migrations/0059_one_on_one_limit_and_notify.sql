-- Two additions to the 1-on-1 interest-request feature (0058):
--
-- 1. An optional per-event cap on how many requests are accepted, first-come-
--    first-served. Enforced atomically via submit_one_on_one_request below —
--    a plain "count then insert" from the API route would race under concurrent
--    submissions right at the limit, so the count check and insert happen inside
--    one function serialized by a per-event advisory lock.
--
-- 2. notified_at — set once the organizer has told the attendee their assignment
--    (see the new .../one-on-one/[requestId]/notify route), so the dashboard can
--    show whether that's already happened instead of risking a duplicate email.

alter table public.events add column if not exists one_on_one_limit integer check (one_on_one_limit is null or one_on_one_limit >= 1);

alter table public.event_one_on_one_requests add column if not exists notified_at timestamptz;

create or replace function public.submit_one_on_one_request(
  p_event_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_note text
)
returns table (ok boolean, error_message text, request_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_limit integer;
  v_count integer;
  v_new_id uuid;
begin
  -- Serializes concurrent submissions for the same event so the count-then-insert
  -- below can't race two requests both past a limit of, say, 1.
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  select organization_id, one_on_one_limit into v_org_id, v_limit
  from public.events
  where id = p_event_id;

  if v_org_id is null then
    return query select false, 'This event could not be found.', null::uuid;
    return;
  end if;

  if v_limit is not null then
    select count(*) into v_count from public.event_one_on_one_requests where event_id = p_event_id;
    if v_count >= v_limit then
      return query select false, 'This event has reached its 1-on-1 request limit.', null::uuid;
      return;
    end if;
  end if;

  insert into public.event_one_on_one_requests (organization_id, event_id, full_name, email, phone, note)
  values (v_org_id, p_event_id, p_full_name, p_email, p_phone, p_note)
  returning id into v_new_id;

  return query select true, null::text, v_new_id;
end;
$$;

-- No anon/authenticated grant — called only from the service-role request route
-- (see /api/orgs/[slug]/events/[eventId]/one-on-one/request), which does its own
-- published/enabled checks before ever reaching this function. Keeping it
-- service-role-only avoids a second, unvalidated public entry point onto a
-- security-definer insert.
