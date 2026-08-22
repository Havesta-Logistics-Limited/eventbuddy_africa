-- Phase 5 follow-up: let platform admins permanently delete an organization from
-- the /platform dashboard. There's deliberately no RLS delete policy on
-- organizations (owners can't delete their own org from the app), so this is the
-- only path — a SECURITY DEFINER function, same pattern as add/remove_platform_admin.
-- Deleting the row cascades destinations, universities, events, staff, leads, and
-- registrations via their existing `on delete cascade` foreign keys. It does NOT
-- delete the owner's auth.users account — only the organization and its data.

create or replace function public.delete_organization(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can delete an organization.';
  end if;

  delete from public.organizations where id = target_org_id;
end;
$$;

revoke all on function public.delete_organization(uuid) from public;
grant execute on function public.delete_organization(uuid) to authenticated;
