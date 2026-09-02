-- The event-publish flat fee was never actually wired up to any real payment
-- flow in the product — no UI anywhere calls /api/paystack/initialize, so
-- price_naira/payment_status on events have been dead weight, not a real
-- charge. Ticket-sale commission is the only revenue model going forward.
-- Stop snapshotting a fee nobody is ever charged, and zero out the phantom
-- "pending" amount on existing unpaid physical events so the platform
-- dashboard's numbers match reality instead of showing money that was never
-- actually owed.
drop trigger if exists events_set_price_naira on public.events;
drop function if exists public.set_event_price_naira();

update public.events
set price_naira = 0
where event_format <> 'virtual' and payment_status <> 'paid';
