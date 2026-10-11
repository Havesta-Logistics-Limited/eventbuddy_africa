-- Proposals (2026-10-11): the platform portal's Quotes & Invoices tab can also
-- make client proposals: a branded multi-page PDF with the event's details,
-- scope of work, commercial quote, delivery plan, responsibilities, items to
-- confirm and an acceptance block.
--
--   * doc_type gains 'proposal' (numbered P-0001, P-0002, ...)
--   * content: the proposal's sections (cover, scope, fees, plan...). Quotes
--     and invoices don't use it. The fixed fees still live in line_items, so
--     totals work the same for every document.

alter table public.platform_documents drop constraint if exists platform_documents_doc_type_check;
alter table public.platform_documents add constraint platform_documents_doc_type_check
  check (doc_type in ('quote', 'invoice', 'proposal'));

alter table public.platform_documents add column if not exists content jsonb;
