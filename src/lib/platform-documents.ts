import { createClient as createSupabaseBrowserClient } from "./supabase/client";
import { PersistError } from "./store";
import { PlatformDocument, PlatformDocumentLineItem, PlatformDocumentStatus, PlatformDocumentType } from "./types";

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
  const prefix = docType === "quote" ? "Q" : "INV";
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
    })
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

export function documentTotal(doc: Pick<PlatformDocument, "lineItems">): number {
  return doc.lineItems.reduce((sum, item) => sum + lineItemTotal(item), 0);
}
