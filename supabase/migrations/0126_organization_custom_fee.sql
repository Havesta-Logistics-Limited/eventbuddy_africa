-- Custom commission per organizer (2026-10-15): a platform admin can agree a
-- special rate with one organizer: a percentage plus a flat amount per ticket
-- or stand sale, with a note about the agreement.
--
-- Precedence at checkout: fee-exempt (nothing) > this custom rate > the
-- organizer's plan > the platform default. Both parts are set together, or
-- both cleared to return to the standard rate.
--
-- Only platform admins can change these columns (added to the 0103 guard), and
-- they're exposed on organizations_payout_masked for the admin's lists.

alter table public.organizations
  add column if not exists custom_fee_percentage numeric(5, 2),
  add column if not exists custom_fee_flat_naira numeric(10, 2),
  add column if not exists custom_fee_note text,
  add column if not exists custom_fee_set_at timestamptz,
  add column if not exists custom_fee_set_by uuid references auth.users (id) on delete set null;

alter table public.organizations drop constraint if exists organizations_custom_fee_valid;
alter table public.organizations add constraint organizations_custom_fee_valid check (
  (custom_fee_percentage is null and custom_fee_flat_naira is null)
  or (
    custom_fee_percentage is not null and custom_fee_flat_naira is not null
    and custom_fee_percentage between 0 and 50
    and custom_fee_flat_naira between 0 and 100000
  )
);
alter table public.organizations drop constraint if exists organizations_custom_fee_note_len;
alter table public.organizations add constraint organizations_custom_fee_note_len check (custom_fee_note is null or length(custom_fee_note) <= 500);

-- organizers can't change their own rate
create or replace function public.protect_organization_money_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_platform_admin() then
    new.owner_user_id := old.owner_user_id;
    new.is_fee_exempt := old.is_fee_exempt;
    new.is_suspended := old.is_suspended;
    new.is_verified := old.is_verified;
    new.paystack_subaccount_code := old.paystack_subaccount_code;
    new.payout_bank_code := old.payout_bank_code;
    new.payout_bank_name := old.payout_bank_name;
    new.payout_account_number := old.payout_account_number;
    new.payout_account_name := old.payout_account_name;
    new.payout_change_status := old.payout_change_status;
    new.payout_change_requested_at := old.payout_change_requested_at;
    new.payout_change_approved_at := old.payout_change_approved_at;
    new.payout_verified := old.payout_verified;
    new.payout_verified_at := old.payout_verified_at;
    new.payout_recipient_code := old.payout_recipient_code;
    new.custom_fee_percentage := old.custom_fee_percentage;
    new.custom_fee_flat_naira := old.custom_fee_flat_naira;
    new.custom_fee_note := old.custom_fee_note;
    new.custom_fee_set_at := old.custom_fee_set_at;
    new.custom_fee_set_by := old.custom_fee_set_by;
  end if;
  return new;
end;
$$;

-- and an organizer creating their org can't pre-set one either (0119 guard)
create or replace function public.protect_organization_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_platform_admin() then
    new.is_fee_exempt := false;
    new.is_suspended := false;
    new.paystack_subaccount_code := null;
    new.payout_bank_code := null;
    new.payout_bank_name := null;
    new.payout_account_number := null;
    new.payout_account_name := null;
    new.payout_change_status := 'none';
    new.payout_change_requested_at := null;
    new.payout_change_approved_at := null;
    new.payout_verified := false;
    new.payout_verified_at := null;
    new.payout_recipient_code := null;
    new.plan_id := 'launch';
    new.plan_status := 'active';
    new.plan_period_end := null;
    new.plan_comped := false;
    new.paystack_customer_code := null;
    new.paystack_subscription_code := null;
    new.paystack_subscription_token := null;
    new.custom_fee_percentage := null;
    new.custom_fee_flat_naira := null;
    new.custom_fee_note := null;
    new.custom_fee_set_at := null;
    new.custom_fee_set_by := null;
  end if;
  return new;
end;
$$;

-- the admin's lists (new columns go at the end of the view)
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
  payout_verified,
  custom_fee_percentage, custom_fee_flat_naira
from public.organizations;
