-- Organization name changes now require platform-admin approval, mirroring
-- the existing payout-change-request pattern (payout_change_status /
-- payout_change_requested_at). The org's own RLS update policy
-- (organizations_update_own) already lets an owner write any column on
-- their own row, `name` included — the trigger below is the actual security
-- boundary: it silently reverts any direct change to `name` unless the
-- caller is the service role or a platform admin, so a rename can only ever
-- take effect via the request/approve flow, never a raw API call against
-- the row the owner already has write access to.
alter table public.organizations add column if not exists pending_name text;
alter table public.organizations add column if not exists name_change_status text not null default 'none' check (name_change_status in ('none', 'requested'));
alter table public.organizations add column if not exists name_change_requested_at timestamptz;

create or replace function public.protect_organization_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_platform_admin() then
    if new.name is distinct from old.name then
      new.name := old.name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_name on public.organizations;
create trigger organizations_protect_name
  before update on public.organizations
  for each row execute function public.protect_organization_name();

-- The platform admin org list reads through this masked view (see 0042), not
-- the base table directly — it needs the new columns too or they'd never
-- reach the dashboard.
create or replace view public.organizations_payout_masked
with (security_invoker = true) as
select id, name, slug, created_at, is_suspended, is_fee_exempt, is_verified, phone, email,
  paystack_subaccount_code, payout_bank_name,
  case when payout_account_number is null then null
    else repeat('•', greatest(length(payout_account_number) - 4, 0)) || right(payout_account_number, 4)
  end as payout_account_number_masked,
  payout_account_name, payout_change_status, payout_change_requested_at,
  pending_name, name_change_status, name_change_requested_at
from public.organizations;
