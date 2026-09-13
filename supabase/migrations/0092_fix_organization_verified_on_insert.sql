-- Fixes a real gap in 0016_organization_verification.sql: that migration only syncs
-- organizations.is_verified when auth.users.email_confirmed_at CHANGES — i.e., the
-- owner confirms their email AFTER their organization already exists. It never
-- checks whether the email was ALREADY confirmed at the moment a NEW organization
-- is created, which is exactly what happens for the self-serve organizer flow (see
-- the mobile app's createMyOrganization): any signed-in user, including one who
-- confirmed their email as a plain attendee days or weeks earlier, can spin up an
-- organization at any time. That organization silently defaulted to is_verified =
-- false forever, since nothing ever re-checked it after insert. Confirmed directly
-- against a real org ("Global Tech") whose owner's email was confirmed 10 days
-- before the organization row was even created.

create or replace function public.set_organization_verified_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_verified is not true and exists (
    select 1 from auth.users where id = new.owner_user_id and email_confirmed_at is not null
  ) then
    new.is_verified := true;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_set_verified_on_insert on public.organizations;
create trigger organizations_set_verified_on_insert
  before insert on public.organizations
  for each row
  execute function public.set_organization_verified_on_insert();

-- Backfill every existing organization stuck unverified despite its owner's email
-- already being confirmed.
update public.organizations o
set is_verified = true
where is_verified = false
  and exists (
    select 1 from auth.users u where u.id = o.owner_user_id and u.email_confirmed_at is not null
  );
