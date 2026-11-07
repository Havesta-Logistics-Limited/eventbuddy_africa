-- How a campaign email opens (2026-11-07): {"mode":"name","prefix":"Hi","fallback":"Hi there,"}
-- greets each person by first name (or with the fallback line when the list
-- has no name for them); {"mode":"none"} leaves the greeting out. Null on
-- older campaigns means the original "Hi <first name>," / "Hi there,".
alter table public.platform_campaigns add column if not exists greeting jsonb;
