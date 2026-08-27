-- Two additions to the RSVP guest-list feature (0040):
--
-- 1. Named plus-ones: a guest accepting with plus-ones now names each one, and each
--    gets their own real registrations row (their own QR/reference ID for check-in),
--    not just a headcount. registrations.guest_invite_id links every registration
--    born from one invite (the primary guest's own registration included) back to
--    that event_guests row, so the organizer can see the whole party together.
--    event_guests.registration_id keeps pointing at the primary guest's own
--    registration specifically, unchanged.
--
-- 2. reminder_sent_at tracks whether the "you haven't responded yet" nudge has
--    already gone out for this guest, so the reminder cron sends exactly once per
--    guest regardless of how often it runs.

alter table public.event_guests add column if not exists reminder_sent_at timestamptz;

alter table public.registrations add column if not exists guest_invite_id uuid references public.event_guests (id) on delete set null;
create index if not exists registrations_guest_invite_id_idx on public.registrations (guest_invite_id);
