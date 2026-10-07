-- Walk-up registrations from the staff Kiosk (2026-10-07) are recorded with
-- source 'kiosk', so organizers can tell door sign-ups from online ones.
alter table public.registrations drop constraint if exists registrations_source_check;
alter table public.registrations add constraint registrations_source_check
  check (source in ('web', 'mobile', 'kiosk'));
