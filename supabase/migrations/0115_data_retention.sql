-- Data retention (2026-10-07). A nightly job (/api/cron/data-retention)
-- removes personal data that's no longer needed, in line with the Privacy
-- Policy's retention section:
--
--   * exhibitor leads: 90 days after the event ends. Exhibitors with leads are
--     emailed 7 days before (exhibitors.retention_reminded_at), and the
--     exhibitor's portal link stops working when their leads are removed.
--   * exhibitor staff passes: 30 days after the event ends (a pass another
--     exhibitor scanned as a lead stays until that lead goes).
--   * abandoned payment attempts (pending or failed, never paid): 90 days.
--
-- Payments, payouts, refunds and the ledger are accounting records and are
-- never removed here; organizers' own attendee data stays with their account.

alter table public.exhibitors
  add column if not exists retention_reminded_at timestamptz,
  add column if not exists data_removed_at timestamptz;

-- an event "ends" on its end date, or its date for a one-day event
create or replace function public._event_end(e public.events)
returns date
language sql
immutable
as $$ select coalesce(e.end_date, e.date) $$;

-- Exhibitors to remind: leads exist, the event ended 83-89 days ago, not yet reminded.
create or replace function public.retention_exhibitor_reminders()
returns table (exhibitor_id uuid, email text, company_name text, contact_name text, event_name text, delete_on date, portal_token uuid, lead_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.email, x.company_name, x.contact_name, e.name,
         public._event_end(e) + 90, x.portal_token,
         (select count(*) from public.exhibitor_leads l where l.exhibitor_id = x.id)
  from public.exhibitors x
  join public.events e on e.id = x.event_id
  where x.status = 'paid'
    and x.retention_reminded_at is null
    and x.data_removed_at is null
    and public._event_end(e) between current_date - 89 and current_date - 83
    and exists (select 1 from public.exhibitor_leads l where l.exhibitor_id = x.id);
$$;

create or replace function public.run_data_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leads integer;
  v_portals integer;
  v_passes integer;
  v_payments integer;
begin
  -- exhibitor leads, 90 days after the event
  with gone as (
    delete from public.exhibitor_leads l
    using public.events e
    where e.id = l.event_id and public._event_end(e) < current_date - 90
    returning l.exhibitor_id
  )
  select count(*) into v_leads from gone;

  -- close those exhibitors' portals: a new token kills the old link
  with closed as (
    update public.exhibitors x
    set portal_token = gen_random_uuid(), data_removed_at = now()
    from public.events e
    where e.id = x.event_id and x.data_removed_at is null and public._event_end(e) < current_date - 90
    returning x.id
  )
  select count(*) into v_portals from closed;

  -- staff passes, 30 days after the event (unless another exhibitor holds it as a lead)
  with gone as (
    delete from public.registrations r
    using public.events e
    where e.id = r.event_id
      and r.source = 'exhibitor'
      and public._event_end(e) < current_date - 30
      and not exists (select 1 from public.exhibitor_leads l where l.registration_id = r.id)
    returning r.id
  )
  select count(*) into v_passes from gone;

  -- payment attempts that never went through
  with gone as (
    delete from public.paystack_transactions t
    where t.status in ('pending', 'failed')
      and t.created_at < now() - interval '90 days'
      and not exists (select 1 from public.ledger_entries le where le.transaction_id = t.id)
    returning t.id
  )
  select count(*) into v_payments from gone;

  return jsonb_build_object('exhibitor_leads', v_leads, 'exhibitor_portals_closed', v_portals, 'staff_passes', v_passes, 'abandoned_payments', v_payments);
end;
$$;

revoke all on function public.retention_exhibitor_reminders() from public, anon, authenticated;
revoke all on function public.run_data_retention() from public, anon, authenticated;
