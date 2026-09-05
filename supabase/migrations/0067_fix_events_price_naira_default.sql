-- Fixes a live bug: migration 0045 dropped the trigger that used to auto-fill
-- events.price_naira on insert (it backed the flat publish fee, since scrapped),
-- but never gave the column a default — and application code has never set
-- price_naira explicitly since it became "legacy, always 0" (see 0045's own
-- comment). Every event creation since 0045 was applied has been silently
-- relying on a trigger that no longer exists, and finally surfaced as
-- "null value in column price_naira ... violates not-null constraint" the
-- moment nobody happened to pass a value. A default is the actual permanent
-- fix — this is what 0045 should have added when it dropped the trigger.
alter table public.events alter column price_naira set default 0;
