-- Invitation flyers for invite-only events (2026-10-21). The organizer uploads
-- their own designed flyer and places a QR box on it; every guest gets that
-- flyer with their own entry QR (their registration's reference) and their
-- name drawn under it. Imported guests can be confirmed straight away, so each
-- has a registration (and QR) before any invitation is sent.
--
-- invite_design: { url, width, height,
--   qr: { x, y, size }        -- fractions of the flyer's width/height (size = fraction of width)
--   label: { mode, color } }  -- mode: 'first' | 'last' | 'full' | 'none'
alter table public.events add column if not exists invite_design jsonb;
