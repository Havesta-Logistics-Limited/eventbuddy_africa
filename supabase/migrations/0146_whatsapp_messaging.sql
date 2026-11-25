-- 0146 WhatsApp messaging (pilot, through a self-hosted WAHA server)
--
--   * whatsapp_outbox: every WhatsApp message eventbuddy sends on its own
--     (invitation flyers, tickets, day-of reminders) waits here and goes out
--     slowly, a couple a minute, from /api/cron/whatsapp-outbox, so the number
--     never looks like a spammer. Replies to people who message us first are
--     sent straight away and only recorded here (kind 'reply').
--     dedupe_key makes every send happen once (e.g. 'ticket:<registration id>').
--   * whatsapp_optouts: numbers that replied STOP. Nothing is sent to them
--     except the confirmation of STOP / START itself.
--   * claim_whatsapp_outbox(): hands the next messages to one worker run, so
--     two overlapping runs can never send the same message twice.
--
-- Server only: the service role writes and reads all of it. Platform admins
-- can read the outbox and opt-outs; organizers see their own counts through
-- the app's API, never the table.

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('invite', 'ticket', 'reminder', 'reply')),
  dedupe_key text unique,
  to_phone text not null check (to_phone ~ '^\+[0-9]{10,15}$'),
  body text not null check (length(body) between 1 and 4000),
  -- what picture goes with the message, built when it's sent so it's never stale:
  -- 'invite_flyer' (guest's flyer with their QR) or 'ticket_qr' (registration QR)
  image_kind text check (image_kind in ('invite_flyer', 'ticket_qr')),
  -- shown instead of the picture if WhatsApp won't take it (e.g. the guest's /i/ link)
  fallback_text text,
  organization_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  guest_id uuid references public.event_guests(id) on delete cascade,
  priority smallint not null default 5,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 0,
  last_error text,
  not_before timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);

create index if not exists whatsapp_outbox_queue_idx on public.whatsapp_outbox (priority, not_before, created_at) where status = 'queued';
create index if not exists whatsapp_outbox_event_idx on public.whatsapp_outbox (event_id, kind, status);
create index if not exists whatsapp_outbox_sent_idx on public.whatsapp_outbox (sent_at) where status = 'sent';

alter table public.whatsapp_outbox enable row level security;
drop policy if exists whatsapp_outbox_platform_admin_read on public.whatsapp_outbox;
create policy whatsapp_outbox_platform_admin_read on public.whatsapp_outbox for select using (public.is_platform_admin());
revoke insert, update, delete on public.whatsapp_outbox from anon, authenticated;

create table if not exists public.whatsapp_optouts (
  phone text primary key check (phone ~ '^\+[0-9]{10,15}$'),
  created_at timestamptz not null default now()
);
alter table public.whatsapp_optouts enable row level security;
drop policy if exists whatsapp_optouts_platform_admin_read on public.whatsapp_optouts;
create policy whatsapp_optouts_platform_admin_read on public.whatsapp_optouts for select using (public.is_platform_admin());
revoke insert, update, delete on public.whatsapp_optouts from anon, authenticated;

-- the WhatsApp assistant finds someone's tickets by the number they message from
create index if not exists registrations_phone_idx on public.registrations (phone) where phone is not null;

-- Next messages for one worker run. A message stuck in 'sending' for 10
-- minutes (a run that died mid-send) goes back in the queue first; after 3
-- tries it's marked failed.
create or replace function public.claim_whatsapp_outbox(p_limit integer)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_outbox
     set status = case when attempts >= 3 then 'failed' else 'queued' end,
         last_error = coalesce(last_error, 'Send was interrupted')
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  update public.whatsapp_outbox
     set status = 'skipped', last_error = 'Too late to send'
   where status = 'queued' and expires_at is not null and expires_at < now();

  return query
  update public.whatsapp_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select id from public.whatsapp_outbox
      where status = 'queued' and not_before <= now()
      order by priority, not_before, created_at
      limit greatest(1, least(p_limit, 20))
      for update skip locked
   )
  returning o.*;
end;
$$;

revoke execute on function public.claim_whatsapp_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox(integer) to service_role;
