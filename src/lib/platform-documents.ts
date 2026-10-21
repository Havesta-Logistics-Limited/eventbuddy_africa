import { createClient as createSupabaseBrowserClient } from "./supabase/client";
import { PersistError } from "./store";
import { PaymentMethod, PlatformDocument, PlatformDocumentLineItem, PlatformDocumentStatus, PlatformDocumentType } from "./types";
import { proposalLineItems, withProposalDefaults, type ProposalContent } from "./proposal";

function mapRow(row: {
  id: string;
  doc_number: string;
  doc_type: string;
  status: string;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  client_address: string | null;
  line_items: unknown;
  notes: string | null;
  valid_until: string | null;
  vat_rate?: number | string | null;
  source_document_id?: string | null;
  paid_amount_naira?: number | string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  paid_on?: string | null;
  balance_due_naira?: number | string | null;
  content?: unknown;
  created_at: string;
  updated_at: string;
}): PlatformDocument {
  return {
    id: row.id,
    docNumber: row.doc_number,
    docType: row.doc_type as PlatformDocumentType,
    status: row.status as PlatformDocumentStatus,
    clientName: row.client_name,
    clientCompany: row.client_company,
    clientEmail: row.client_email,
    clientAddress: row.client_address,
    lineItems: (row.line_items as PlatformDocumentLineItem[] | null) ?? [],
    notes: row.notes,
    validUntil: row.valid_until,
    vatRate: row.vat_rate == null ? null : Number(row.vat_rate),
    sourceDocumentId: row.source_document_id ?? null,
    paidAmountNaira: row.paid_amount_naira == null ? null : Number(row.paid_amount_naira),
    paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
    paymentReference: row.payment_reference ?? null,
    paidOn: row.paid_on ?? null,
    balanceDueNaira: row.balance_due_naira == null ? null : Number(row.balance_due_naira),
    content: row.doc_type === "proposal" ? withProposalDefaults(row.content as Partial<ProposalContent> | null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPlatformDocuments(): Promise<PlatformDocument[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("platform_documents").select("*").order("created_at", { ascending: false });
  if (error) throw new PersistError(error);
  return (data ?? []).map(mapRow);
}

/** Client-side sequential numbering (Q-0001, INV-0001) rather than a DB
 *  sequence — this is a low-traffic, manually-driven admin tool with no real
 *  concurrent-write risk, so counting existing documents of the same type is
 *  simpler than introducing a Postgres sequence/RPC for it. */
async function nextDocNumber(docType: PlatformDocumentType): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from("platform_documents").select("id", { count: "exact", head: true }).eq("doc_type", docType);
  if (error) throw new PersistError(error);
  const prefix = docType === "quote" ? "Q" : docType === "proposal" ? "P" : docType === "receipt" ? "RCT" : "INV";
  return `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function createPlatformDocument(input: {
  docType: PlatformDocumentType;
  clientName: string;
  clientCompany?: string;
  clientEmail?: string;
  clientAddress?: string;
  lineItems: PlatformDocumentLineItem[];
  notes?: string;
  validUntil?: string;
  vatRate?: number | null;
}): Promise<PlatformDocument> {
  const supabase = createSupabaseBrowserClient();
  const docNumber = await nextDocNumber(input.docType);
  const { data, error } = await supabase
    .from("platform_documents")
    .insert({
      doc_number: docNumber,
      doc_type: input.docType,
      client_name: input.clientName,
      client_company: input.clientCompany || null,
      client_email: input.clientEmail || null,
      client_address: input.clientAddress || null,
      line_items: input.lineItems,
      notes: input.notes || null,
      valid_until: input.validUntil || null,
      vat_rate: input.vatRate ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new PersistError(error);
  return mapRow(data);
}

/** Saves edits to a quote or invoice; its type and number stay the same. */
export async function updatePlatformDocument(
  id: string,
  input: {
    clientName: string;
    clientCompany?: string;
    clientEmail?: string;
    clientAddress?: string;
    lineItems: PlatformDocumentLineItem[];
    notes?: string;
    validUntil?: string;
    vatRate?: number | null;
  }
): Promise<PlatformDocument> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("platform_documents")
    .update({
      client_name: input.clientName,
      client_company: input.clientCompany || null,
      client_email: input.clientEmail || null,
      client_address: input.clientAddress || null,
      line_items: input.lineItems,
      notes: input.notes || null,
      valid_until: input.validUntil || null,
      vat_rate: input.vatRate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) throw new PersistError(error);
  return mapRow(data);
}

export async function updatePlatformDocumentStatus(id: string, status: PlatformDocumentStatus): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("platform_documents").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new PersistError(error);
}

export async function deletePlatformDocument(id: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("platform_documents").delete().eq("id", id);
  if (error) throw new PersistError(error);
}

export function lineItemTotal(item: PlatformDocumentLineItem): number {
  return item.quantity * item.unitPriceNaira;
}

export function documentSubtotal(doc: Pick<PlatformDocument, "lineItems">): number {
  return doc.lineItems.reduce((sum, item) => sum + lineItemTotal(item), 0);
}

/** VAT on the subtotal, to the kobo (migration 0131); 0 when no rate is set. */
export function documentVat(doc: Pick<PlatformDocument, "lineItems" | "vatRate">): number {
  return doc.vatRate ? Math.round(documentSubtotal(doc) * doc.vatRate) / 100 : 0;
}

/** What the client pays: subtotal plus any VAT. */
export function documentTotal(doc: Pick<PlatformDocument, "lineItems"> & { vatRate?: number | null }): number {
  return documentSubtotal(doc) + documentVat({ lineItems: doc.lineItems, vatRate: doc.vatRate ?? null });
}

/** Creates a proposal (id omitted) or saves changes to one. The client fields
 *  and fixed fees are mirrored onto the document's own columns, so the list,
 *  totals and status work as for quotes. */
export async function savePlatformProposal(input: {
  id?: string;
  clientName: string;
  clientEmail?: string;
  validUntil?: string;
  content: ProposalContent;
}): Promise<PlatformDocument> {
  const supabase = createSupabaseBrowserClient();
  const fields = {
    client_name: input.clientName,
    client_company: input.content.eventName || null,
    client_email: input.clientEmail || null,
    line_items: proposalLineItems(input.content),
    valid_until: input.validUntil || null,
    content: input.content,
    updated_at: new Date().toISOString(),
  };
  const q = input.id
    ? supabase.from("platform_documents").update(fields).eq("id", input.id)
    : supabase.from("platform_documents").insert({ ...fields, doc_type: "proposal", doc_number: await nextDocNumber("proposal") });
  const { data, error } = await q.select().single();
  if (error) throw new PersistError(error);
  return mapRow(data);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
  paystack: "Paystack",
  other: "Other",
};

/** Money already received against a document, from its receipts. */
export function amountReceived(sourceId: string, docs: PlatformDocument[]): number {
  return docs.filter((d) => d.docType === "receipt" && d.sourceDocumentId === sourceId).reduce((n, d) => n + (d.paidAmountNaira ?? 0), 0);
}

/**
 * Issues a receipt (RCT-0001, …) for money received against a quote, invoice
 * or proposal (migration 0134): it copies the client and items, records the
 * payment and the balance still due, and marks the source paid or part paid.
 */
export async function createReceipt(
  source: PlatformDocument,
  alreadyReceived: number,
  payment: { amountNaira: number; paidOn: string; method: PaymentMethod; reference?: string }
): Promise<{ receipt: PlatformDocument; sourceStatus: PlatformDocumentStatus }> {
  const supabase = createSupabaseBrowserClient();
  const total = documentTotal(source);
  const balance = Math.max(0, Math.round((total - alreadyReceived - payment.amountNaira) * 100) / 100);
  const { data, error } = await supabase
    .from("platform_documents")
    .insert({
      doc_number: await nextDocNumber("receipt"),
      doc_type: "receipt",
      status: "paid",
      client_name: source.clientName,
      client_company: source.clientCompany || null,
      client_email: source.clientEmail || null,
      client_address: source.clientAddress || null,
      line_items: source.lineItems,
      vat_rate: source.vatRate ?? null,
      source_document_id: source.id,
      paid_amount_naira: payment.amountNaira,
      payment_method: payment.method,
      payment_reference: payment.reference?.trim() || null,
      paid_on: payment.paidOn,
      balance_due_naira: balance,
    })
    .select()
    .single();
  if (error || !data) throw new PersistError(error);
  const sourceStatus: PlatformDocumentStatus = balance <= 0 ? "paid" : "part_paid";
  await updatePlatformDocumentStatus(source.id, sourceStatus);
  return { receipt: mapRow(data), sourceStatus };
}
