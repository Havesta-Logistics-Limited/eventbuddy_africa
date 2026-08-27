-- Mirrors registrations.guest_invite_id (0041) onto leads, so the virtual-event
-- RSVP accept path can also detect and skip already-created party members on a
-- retry after a partial failure, the same way the physical-registration path
-- will once the route is updated to look this column up before inserting.
alter table public.leads add column if not exists guest_invite_id uuid references public.event_guests (id) on delete set null;
create index if not exists leads_guest_invite_id_idx on public.leads (guest_invite_id);
