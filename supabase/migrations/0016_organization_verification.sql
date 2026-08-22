-- Require email verification before an org owner gets dashboard access, and surface
-- that status on the /platform portal. Signup (src/app/api/signup/route.ts) now
-- creates the auth user with email_confirm: false and emails a verification link
-- itself (via Resend) instead of auto-confirming — this migration is what marks the
-- organization verified once that link is clicked.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.organizations add column if not exists is_verified boolean not null default false;

-- Supabase Auth confirms the user (sets auth.users.email_confirmed_at) when the
-- verification link is clicked; this trigger mirrors that onto the organization row,
-- since the browser client can't query auth.users directly (same reasoning as
-- add_platform_admin's email lookup in 0005_platform_admin_management.sql).
create or replace function public.sync_organization_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null then
    update public.organizations
    set is_verified = true
    where owner_user_id = new.id and is_verified = false;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row
  execute function public.sync_organization_verified();

-- Backfill: organizations created under the old auto-confirm flow (email_confirm:
-- true at signup) already have a confirmed owner and shouldn't retroactively look
-- unverified.
update public.organizations o
set is_verified = true
from auth.users u
where u.id = o.owner_user_id and u.email_confirmed_at is not null and o.is_verified = false;
