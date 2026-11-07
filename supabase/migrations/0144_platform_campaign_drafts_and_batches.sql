-- Campaign drafts and daily batches (2026-11-07).
--
-- Drafts: a campaign being written is saved as a 'draft' row (autosaved), so
-- leaving the page doesn't lose it; it may not have an audience yet. Sending
-- turns the same row into the campaign.
--
-- Batches: a send can stop after a number of emails ('paused', at pause_at)
-- and continue later from next_offset, e.g. 100 a day on Resend's free plan.
-- One campaign, one set of results, nobody emailed twice.

alter table public.platform_campaigns alter column audience drop not null;
alter table public.platform_campaigns alter column audience_label drop not null;
alter table public.platform_campaigns add column if not exists pause_at integer;
alter table public.platform_campaigns add column if not exists updated_at timestamptz not null default now();

alter table public.platform_campaigns drop constraint if exists platform_campaigns_status_check;
alter table public.platform_campaigns add constraint platform_campaigns_status_check check (status in ('draft', 'sending', 'paused', 'sent'));

-- a draft has nothing to send yet; everything else needs its audience
alter table public.platform_campaigns drop constraint if exists platform_campaigns_audience_when_sending;
alter table public.platform_campaigns add constraint platform_campaigns_audience_when_sending check (status = 'draft' or (audience is not null and audience_label is not null));
