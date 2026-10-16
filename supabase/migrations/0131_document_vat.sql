-- VAT on quotes and invoices (2026-10-16): an optional rate (Nigeria's
-- standard is 7.5%) applied to the line items' subtotal. Null = no VAT line.
alter table public.platform_documents add column if not exists vat_rate numeric(5, 2);
alter table public.platform_documents drop constraint if exists platform_documents_vat_rate_range;
alter table public.platform_documents add constraint platform_documents_vat_rate_range check (vat_rate is null or vat_rate between 0 and 50);
