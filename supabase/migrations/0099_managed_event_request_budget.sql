-- Full-Service quote requests now capture a budget band (2026-10-06).
-- The /managed-events form requires it and /api/managed-event-requests only
-- accepts the bands listed in src/lib/managed-events.ts. Nullable so requests
-- made before this change stay valid.
alter table public.managed_event_requests
  add column if not exists budget text;
