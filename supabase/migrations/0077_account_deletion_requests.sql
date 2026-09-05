-- Self-service "Delete My Account" (Settings) requests deletion rather than
-- deleting immediately — same request/approve shape as an org name or login
-- email change (0007/0066), since account deletion is the single most
-- destructive action available and a platform admin should verify it's
-- really the owner (not a hijacked session or a mistake) before it happens.
alter table public.organizations
  add column if not exists account_deletion_status text not null default 'none' check (account_deletion_status in ('none', 'requested')),
  add column if not exists account_deletion_requested_at timestamptz;

-- The platform admin org list reads through this masked view (see 0042/0066),
-- not the base table directly — it needs the new columns too or they'd never
-- reach the dashboard.
create or replace view public.organizations_payout_masked
with (security_invoker = true) as
select id, name, slug, created_at, is_suspended, is_fee_exempt, is_verified, phone, email,
  paystack_subaccount_code, payout_bank_name,
  case when payout_account_number is null then null
    else repeat('•', greatest(length(payout_account_number) - 4, 0)) || right(payout_account_number, 4)
  end as payout_account_number_masked,
  payout_account_name, payout_change_status, payout_change_requested_at,
  pending_name, name_change_status, name_change_requested_at,
  pending_login_email, login_email_change_status, login_email_change_requested_at,
  account_deletion_status, account_deletion_requested_at
from public.organizations;
