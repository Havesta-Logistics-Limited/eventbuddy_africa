-- Receipts for quotes, invoices and proposals (2026-10-21). A receipt is a
-- platform document of its own (numbered RCT-0001, ...) recording money
-- received against another document: amount, date, method and reference.
-- Several receipts can be issued against one document (a deposit, then the
-- balance); each keeps the balance still due at the time it was issued. The
-- source document is marked 'paid', or the new 'part_paid' after a deposit.

alter table public.platform_documents drop constraint if exists platform_documents_doc_type_check;
alter table public.platform_documents add constraint platform_documents_doc_type_check
  check (doc_type in ('quote', 'invoice', 'proposal', 'receipt'));

alter table public.platform_documents drop constraint if exists platform_documents_status_check;
alter table public.platform_documents add constraint platform_documents_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined', 'paid', 'part_paid'));

alter table public.platform_documents
  add column if not exists source_document_id uuid references public.platform_documents (id) on delete set null,
  add column if not exists paid_amount_naira numeric(14, 2),
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists paid_on date,
  add column if not exists balance_due_naira numeric(14, 2);

alter table public.platform_documents drop constraint if exists platform_documents_receipt_valid;
alter table public.platform_documents add constraint platform_documents_receipt_valid check (
  doc_type <> 'receipt'
  or (
    paid_amount_naira is not null and paid_amount_naira > 0
    and payment_method in ('bank_transfer', 'cash', 'pos', 'paystack', 'other')
    and paid_on is not null
    and (payment_reference is null or length(payment_reference) <= 120)
  )
);
create index if not exists platform_documents_source_idx on public.platform_documents (source_document_id) where source_document_id is not null;
