-- Links a lead back to the self-service registration it was pulled from (see
-- /api/registrations/lookup and the "Scan to pull attendee details" panel on /collect),
-- so the same attendee's QR/reference ID can be scanned once per university at a fair —
-- re-scanning for the SAME university is a duplicate and gets blocked; scanning for a
-- DIFFERENT university (a different rep's booth) is a legitimate second lead and is
-- allowed. Nullable — leads captured without ever pulling a registration (walk-ins,
-- non-Education-Fair templates) are unaffected.

alter table public.leads
  add column if not exists registration_id uuid references public.registrations (id) on delete set null;

create index if not exists leads_registration_id_idx on public.leads (registration_id);
