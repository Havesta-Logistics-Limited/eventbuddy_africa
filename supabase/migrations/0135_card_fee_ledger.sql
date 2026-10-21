-- International card fee (2026-10-21). The buyer's processing fee (0130) is
-- sized for a local card, because the card isn't known until after payment.
-- When Paystack charged more (an international card), the gap comes off the
-- organizer's share of that sale as a 'card_fee' ledger entry, so eventbuddy's
-- fee stays whole. Its own kind (not 'adjustment', which a platform refund
-- uses for its credit), and it clears with the sale it belongs to, like the
-- fee. _ledger_balance below is the current definition with 'card_fee' added
-- to that list; nothing else changes.

alter table public.ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table public.ledger_entries add constraint ledger_entries_kind_check check (kind in (
  'sale', 'fee', 'refund', 'dispute', 'payout', 'payout_fee', 'payout_return', 'payout_fee_return', 'adjustment',
  'commission', 'commission_refund', 'commission_earned', 'commission_reversal',
  'card_fee'
));

CREATE OR REPLACE FUNCTION public._ledger_balance(p_org uuid, p_promoter uuid)
 RETURNS TABLE(total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select unverified_lock_days from public.platform_settings where id),
  v as (
    select case when p_org is not null then coalesce((select payout_verified from public.organizations where id = p_org), false) else false end as verified
  ),
  e as (
    select
      l.amount_naira,
      l.kind,
      coalesce(case when l.kind <> 'sale' then sale.clears_at end, l.clears_at) as clears_at,
      ev.id as event_id,
      ev.date as event_date,
      ev.end_date as event_end_date,
      ev.timezone as event_tz
    from public.ledger_entries l
    left join public.ledger_entries sale on sale.transaction_id = l.transaction_id and sale.kind = 'sale' and l.transaction_id is not null
    left join public.events ev on ev.id = l.event_id
    where (p_org is not null and l.organization_id = p_org) or (p_promoter is not null and l.promoter_id = p_promoter)
  ),
  b as (
    select
      amount_naira,
      kind,
      case
        when kind not in ('sale', 'fee', 'refund', 'dispute', 'commission', 'commission_refund', 'commission_earned', 'commission_reversal', 'card_fee') then 'available'
        when clears_at > now() then 'pending'
        when not (select verified from v) and event_id is not null
             and now() < ((coalesce(event_end_date, event_date) + 1)::timestamp at time zone coalesce(nullif(event_tz, ''), 'Africa/Lagos'))
                         + make_interval(days => (select unverified_lock_days from s))
          then 'locked'
        else 'available'
      end as bucket
    from e
  )
  select
    coalesce(sum(amount_naira), 0),
    coalesce(sum(amount_naira) filter (where bucket = 'pending'), 0),
    coalesce(sum(amount_naira) filter (where bucket = 'locked'), 0),
    coalesce(sum(amount_naira) filter (where bucket = 'available'), 0),
    coalesce(-sum(amount_naira) filter (where kind = 'payout'), 0)
      - coalesce(sum(amount_naira) filter (where kind = 'payout_return'), 0)
  from b;
$function$;
