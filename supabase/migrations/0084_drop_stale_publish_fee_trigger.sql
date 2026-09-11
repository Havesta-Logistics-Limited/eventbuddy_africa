-- events_protect_payment_fields (migration 0024) existed to stop an org's own
-- browser client from flipping `published` to true without actually paying
-- the event-publish fee that existed back then. Migration 0045 scrapped that
-- fee entirely ("price_naira/payment_status on events have been dead weight,
-- not a real charge... Ticket-sale commission is the only revenue model
-- going forward") but never dropped this trigger — so it's been silently
-- reverting every organizer's own "Publish Event" click ever since, on any
-- physical event that was ever saved as a draft: the client's UPDATE appears
-- to succeed (no error, since the trigger just overwrites the new value
-- rather than rejecting the statement), so the UI shows a false "published"
-- toast while the database row stays published=false. Nothing today still
-- depends on this protection — ticket purchases are gated through
-- paystack_transactions/registrations, not events.payment_status.
drop trigger if exists events_protect_payment_fields on public.events;
drop function if exists public.protect_event_payment_fields();
