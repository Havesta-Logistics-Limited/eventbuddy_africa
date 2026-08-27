-- Two follow-ups from the infrastructure audit:
--
-- 1. Refund/dispute handling. Previously the webhook only ever branched on
--    charge.success — a Paystack refund or dispute left the ticket/registration
--    permanently valid with no record money came back out. Widens the status
--    check to accept 'refunded'/'disputed', and links each ticket-purchase
--    transaction to the real registration it created so a later refund/dispute
--    can find and cancel that exact row (see handleRefundOrDispute in
--    src/lib/paystack.ts) instead of guessing by email/ticket-type match.
--
-- 2. Platform-admin bank-detail masking. The platform dashboard's bulk org list
--    was shipping every organization's real, unmasked bank account number to
--    the browser even though the UI only ever displayed it masked. This view
--    masks it server-side for the list; a real value is only ever fetched
--    on-demand, per org, through a dedicated route when actually needed.

alter table public.paystack_transactions drop constraint if exists paystack_transactions_status_check;
alter table public.paystack_transactions add constraint paystack_transactions_status_check
  check (status in ('pending', 'success', 'failed', 'refunded', 'disputed'));

alter table public.paystack_transactions add column if not exists registration_id uuid references public.registrations (id) on delete set null;

create or replace function public.decrement_ticket_sold(p_ticket_type_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.ticket_types set quantity_sold = greatest(0, quantity_sold - 1) where id = p_ticket_type_id;
$$;

create or replace function public.decrement_discount_uses(p_discount_code_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.discount_codes set uses_count = greatest(0, uses_count - 1) where id = p_discount_code_id;
$$;

create or replace view public.organizations_payout_masked
with (security_invoker = true) as
select
  id, name, slug, created_at, is_suspended, is_fee_exempt, is_verified, phone, email,
  paystack_subaccount_code, payout_bank_name,
  case
    when payout_account_number is null then null
    else repeat('•', greatest(length(payout_account_number) - 4, 0)) || right(payout_account_number, 4)
  end as payout_account_number_masked,
  payout_account_name, payout_change_status, payout_change_requested_at
from public.organizations;
