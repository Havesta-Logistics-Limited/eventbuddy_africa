-- The platform's Organizations list reads organizations_payout_masked (bank
-- numbers masked). 0118's "Organizer verified" switch needs payout_verified in
-- it; a view can only gain columns at the end, so it's appended.
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
  account_deletion_status, account_deletion_requested_at,
  payout_verified
from public.organizations;
