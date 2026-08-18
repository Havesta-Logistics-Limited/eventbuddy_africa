-- Phase 5 follow-up: let platform admins add/remove other platform admins by email
-- from the /platform dashboard, instead of only via the Supabase Table Editor.

alter table public.platform_admins add column if not exists email text;

update public.platform_admins pa
set email = u.email
from auth.users u
where pa.user_id = u.id and pa.email is null;

-- The browser client can't query auth.users directly (no RLS grants on it), so this
-- SECURITY DEFINER function does the email lookup + insert in one controlled step.
-- It re-checks is_platform_admin() itself since SECURITY DEFINER bypasses RLS —
-- without that check any authenticated user could call it and grant themselves access.
create or replace function public.add_platform_admin(target_email text)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  target_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can add other platform admins.';
  end if;

  select id into target_id from auth.users where lower(auth.users.email) = lower(target_email);
  if target_id is null then
    raise exception 'No account found for that email. They need to sign up (or be created in Supabase Auth) first.';
  end if;

  insert into public.platform_admins (user_id, email)
  values (target_id, target_email)
  on conflict (user_id) do nothing;

  return query select target_id, target_email;
end;
$$;

revoke all on function public.add_platform_admin(text) from public;
grant execute on function public.add_platform_admin(text) to authenticated;

-- Guards against removing the last remaining platform admin, so a UI misclick can't
-- lock the platform out entirely (SQL access is still always available as a fallback).
create or replace function public.remove_platform_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can remove other platform admins.';
  end if;

  if (select count(*) from public.platform_admins) <= 1 then
    raise exception 'Cannot remove the last remaining platform admin.';
  end if;

  delete from public.platform_admins where user_id = target_user_id;
end;
$$;

revoke all on function public.remove_platform_admin(uuid) from public;
grant execute on function public.remove_platform_admin(uuid) to authenticated;
