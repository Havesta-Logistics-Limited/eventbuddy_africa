-- Staff and rep access codes are always set (2026-10-25 audit).
--
-- An event without a staff code let anyone open its check-in page: scan
-- tickets, check people in and read the leads collected there, and the event
-- id is in its public register link. "None — open check-in" was the wizard's
-- default. New events now get a random code when none is given, and a code
-- can't be cleared later. Existing events keep what they have until their
-- codes are next saved, so check-in at an event already under way isn't
-- locked out.
--
-- Codes (and private-event links, 0128) now come from gen_random_uuid(), a
-- cryptographic source, instead of random().

create or replace function public._random_code(p_length integer)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
  i integer;
begin
  for i in 0..p_length - 1 loop
    v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
  end loop;
  return v_code;
end;
$$;
revoke all on function public._random_code(integer) from public, anon, authenticated;

create or replace function public.ensure_event_private_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_code text;
begin
  if new.visibility = 'private' and new.private_code is null then
    loop
      v_code := public._random_code(8);
      exit when not exists (select 1 from public.events where upper(private_code) = v_code);
    end loop;
    new.private_code := v_code;
  end if;
  return new;
end;
$$;

create or replace function public.ensure_event_access_codes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(trim(new.staff_access_code), '') = '' then
    new.staff_access_code := public._random_code(6);
  end if;
  if coalesce(trim(new.rep_access_code), '') = '' then
    new.rep_access_code := public._random_code(6);
  end if;
  return new;
end;
$$;
drop trigger if exists events_ensure_access_codes on public.events;
create trigger events_ensure_access_codes
  before insert or update of staff_access_code, rep_access_code on public.events
  for each row execute function public.ensure_event_access_codes();
