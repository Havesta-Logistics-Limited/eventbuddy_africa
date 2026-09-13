-- First-class ledger numbers for the Wallet view. Today the platform's commission on a
-- sale is never stored — it only exists buried in paystack_event->'fees_split'->>'integration'
-- (mined live, on every render, by the platform admin dashboard). Promoting it to real
-- columns at the moment a transaction is finalized means the Wallet view (and anything
-- else that needs it later) reads a plain number instead of re-parsing Paystack's raw
-- webhook/verify payload every time.
--
-- This does NOT change where money settles: Paystack still splits and pays the
-- organizer's bank directly at charge time via the subaccount (see paystack.ts). These
-- columns are purely informational bookkeeping on top of that existing flow.

alter table public.paystack_transactions
  add column if not exists platform_fee_naira numeric(12, 2),
  add column if not exists net_amount_naira numeric(12, 2);

-- Backfill every already-settled ticket sale from the raw payload captured at
-- verification time, so the Wallet view has real numbers for historical sales too.
update public.paystack_transactions
set
  platform_fee_naira = round(coalesce((paystack_event -> 'fees_split' ->> 'integration')::numeric, 0) / 100.0, 2),
  net_amount_naira = amount_naira - round(coalesce((paystack_event -> 'fees_split' ->> 'integration')::numeric, 0) / 100.0, 2)
where purpose = 'ticket_purchase'
  and status = 'success'
  and platform_fee_naira is null;
