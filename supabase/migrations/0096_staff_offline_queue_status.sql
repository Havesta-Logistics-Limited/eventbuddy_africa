-- Offline lead queues live on staff devices, so the organizer cannot see them:
-- an un-synced lead has never reached the server by definition. What an
-- organizer CAN be told is what each device last reported about itself, which
-- is enough to answer the only question that matters on event day — "is anyone
-- still holding leads that haven't reached us?"
--
-- Both columns are written best-effort by /api/session-data, which staff
-- devices already call on mount, on focus and on a 30s heartbeat. They are a
-- last-known report, never authoritative: a device that is offline cannot
-- update them, which is exactly the case the organizer needs to spot (a stale
-- last_sync_at next to a non-zero count = go find that phone).

alter table public.staff
  add column if not exists pending_leads_count integer not null default 0,
  add column if not exists last_sync_at timestamptz;

comment on column public.staff.pending_leads_count is
  'Last count this device reported as still queued offline. Stale by nature — read alongside last_sync_at.';
comment on column public.staff.last_sync_at is
  'When this device last reached the server. Null means it has not reported since the column was added.';

-- Organizers filter the roster by "who still owes us leads", so the partial
-- index only covers rows that are actually interesting.
create index if not exists staff_pending_leads_idx
  on public.staff (organization_id, event_id)
  where pending_leads_count > 0;
