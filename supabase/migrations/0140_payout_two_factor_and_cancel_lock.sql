-- Payout hardening (2026-10-25 audit).
--
-- 1. request_payout / request_promoter_payout run as security definer, so the
--    database's two-factor rule (has_required_aal, 0094) never applied to them:
--    a password-only session could request a payout on an account that has
--    two-factor turned on. They now require it.
-- 2. cancel_payout checked 'requested' without a lock, then _return_payout
--    accepted 'processing' too, so an owner's cancel racing an admin's send
--    could both send the payout and return it to the balance. _return_payout
--    now refuses a cancel unless the locked row is still 'requested'.

create or replace function public.request_payout(p_org uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_org record;
  v_available numeric;
  v_id uuid;
begin
  select * into v_org from public.organizations where id = p_org for update;
  if v_org.id is null or v_org.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the organization owner can request a payout.' using errcode = '42501';
  end if;
  if not public.has_required_aal() then
    raise exception 'Confirm your two-factor code to request a payout.' using errcode = '42501';
  end if;
  select * into v_settings from public.platform_settings where id;
  if not v_settings.held_funds_enabled then
    raise exception 'Payout requests aren''t switched on yet.';
  end if;
  if v_org.payout_account_number is null then
    raise exception 'Add your bank account in Settings before requesting a payout.';
  end if;
  if v_org.payout_change_status = 'requested' then
    raise exception 'Your bank account change is waiting for approval. You can request a payout once it''s approved.';
  end if;
  if exists (select 1 from public.payout_requests where organization_id = p_org and status in ('requested', 'processing')) then
    raise exception 'You already have a payout in progress. Wait for it to finish or cancel it first.';
  end if;
  p_amount := round(p_amount, 2);
  if p_amount < v_settings.payout_min_naira then
    raise exception 'The minimum payout is ₦%.', to_char(v_settings.payout_min_naira, 'FM999,999,999');
  end if;
  select available_naira into v_available from public._org_balance(p_org);
  if p_amount + v_settings.payout_fee_naira > v_available then
    raise exception 'That''s more than you can withdraw right now (₦% available, including the ₦% payout fee).',
      to_char(greatest(v_available, 0), 'FM999,999,999.00'), to_char(v_settings.payout_fee_naira, 'FM999,999');
  end if;

  insert into public.payout_requests (organization_id, amount_naira, fee_naira, bank_name, account_number_last4, account_name, requested_by)
  values (p_org, p_amount, v_settings.payout_fee_naira, v_org.payout_bank_name, right(v_org.payout_account_number, 4), v_org.payout_account_name, auth.uid())
  returning id into v_id;

  -- reserve the money now so it can't be requested twice
  insert into public.ledger_entries (organization_id, payout_id, kind, amount_naira, created_by, note)
  values (p_org, v_id, 'payout', -p_amount, auth.uid(), 'Payout requested');
  if v_settings.payout_fee_naira > 0 then
    insert into public.ledger_entries (organization_id, payout_id, kind, amount_naira, created_by, note)
    values (p_org, v_id, 'payout_fee', -v_settings.payout_fee_naira, auth.uid(), 'Payout processing fee');
  end if;
  return v_id;
end;
$$;

create or replace function public.request_promoter_payout(p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_p record;
  v_available numeric;
  v_id uuid;
begin
  select * into v_p from public.promoters where user_id = auth.uid() for update;
  if v_p.id is null then raise exception 'Only promoters can request a promoter payout.' using errcode = '42501'; end if;
  if not public.has_required_aal() then raise exception 'Confirm your two-factor code to request a payout.' using errcode = '42501'; end if;
  if v_p.is_suspended then raise exception 'Your promoter account is suspended. Contact eventbuddy.'; end if;
  select * into v_settings from public.platform_settings where id;
  if not v_settings.held_funds_enabled then raise exception 'Payout requests aren''t switched on yet.'; end if;
  if v_p.payout_account_number is null then raise exception 'Add your bank account before requesting a payout.'; end if;
  if v_p.payout_change_status = 'requested' then
    raise exception 'Your bank account change is waiting for approval. You can request a payout once it''s approved.';
  end if;
  if exists (select 1 from public.payout_requests where promoter_id = v_p.id and status in ('requested', 'processing')) then
    raise exception 'You already have a payout in progress. Wait for it to finish or cancel it first.';
  end if;
  p_amount := round(p_amount, 2);
  if p_amount < v_settings.payout_min_naira then
    raise exception 'The minimum payout is ₦%.', to_char(v_settings.payout_min_naira, 'FM999,999,999');
  end if;
  select available_naira into v_available from public._ledger_balance(null, v_p.id);
  if p_amount + v_settings.payout_fee_naira > v_available then
    raise exception 'That''s more than you can withdraw right now (₦% available, including the ₦% payout fee).',
      to_char(greatest(v_available, 0), 'FM999,999,999.00'), to_char(v_settings.payout_fee_naira, 'FM999,999');
  end if;
  insert into public.payout_requests (promoter_id, amount_naira, fee_naira, bank_name, account_number_last4, account_name, requested_by)
  values (v_p.id, p_amount, v_settings.payout_fee_naira, v_p.payout_bank_name, right(v_p.payout_account_number, 4), v_p.payout_account_name, auth.uid())
  returning id into v_id;
  insert into public.ledger_entries (promoter_id, payout_id, kind, amount_naira, created_by, note)
  values (v_p.id, v_id, 'payout', -p_amount, auth.uid(), 'Payout requested');
  if v_settings.payout_fee_naira > 0 then
    insert into public.ledger_entries (promoter_id, payout_id, kind, amount_naira, created_by, note)
    values (v_p.id, v_id, 'payout_fee', -v_settings.payout_fee_naira, auth.uid(), 'Payout processing fee');
  end if;
  return v_id;
end;
$$;

create or replace function public._return_payout(p_payout uuid, p_status text, p_note text, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.payout_requests where id = p_payout for update;
  if v.id is null then raise exception 'Payout not found.'; end if;
  if v.status not in ('requested', 'processing') then
    raise exception 'This payout is already %.', v.status;
  end if;
  -- checked under the row lock: an owner's cancel racing an admin's send must
  -- not return money that is already on its way to the bank
  if p_status = 'cancelled' and v.status <> 'requested' then
    raise exception 'This payout can no longer be cancelled.';
  end if;
  update public.payout_requests
  set status = p_status, decided_by = coalesce(decided_by, p_by), decided_at = coalesce(decided_at, now()),
      decision_note = case when p_status = 'failed' then decision_note else p_note end,
      failure_reason = case when p_status = 'failed' then p_note else failure_reason end
  where id = p_payout;
  insert into public.ledger_entries (organization_id, promoter_id, payout_id, kind, amount_naira, created_by, note)
  values (v.organization_id, v.promoter_id, p_payout, 'payout_return', v.amount_naira, p_by, 'Payout ' || p_status)
  on conflict do nothing;
  if v.fee_naira > 0 then
    insert into public.ledger_entries (organization_id, promoter_id, payout_id, kind, amount_naira, created_by, note)
    values (v.organization_id, v.promoter_id, p_payout, 'payout_fee_return', v.fee_naira, p_by, 'Payout fee returned')
    on conflict do nothing;
  end if;
end;
$$;
