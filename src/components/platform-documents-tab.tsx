"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download, FileText, Plus, Trash2, X } from "lucide-react";
import { PlatformDocument, PlatformDocumentLineItem, PlatformDocumentStatus, PlatformDocumentType } from "@/lib/types";
import {
  createPlatformDocument,
  deletePlatformDocument,
  documentTotal,
  listPlatformDocuments,
  updatePlatformDocumentStatus,
} from "@/lib/platform-documents";
import { PlatformDocumentPdf } from "./platform-document-pdf";

function formatNaira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

const STATUS_STYLES: Record<PlatformDocumentStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-rose-50 text-rose-700",
  paid: "bg-brand-600/10 text-brand-600",
};

const EMPTY_LINE_ITEM: PlatformDocumentLineItem = { description: "", quantity: 1, unitPriceNaira: 0 };
const EMPTY_FORM = {
  docType: "quote" as PlatformDocumentType,
  clientName: "",
  clientCompany: "",
  clientEmail: "",
  clientAddress: "",
  notes: "",
  validUntil: "",
  lineItems: [{ ...EMPTY_LINE_ITEM }] as PlatformDocumentLineItem[],
};

/** Platform-admin-only tool for generating branded quotes/invoices to send to
 *  prospective or existing clients — entirely separate from any organization's
 *  own billing, and not visible anywhere in the org dashboard. PDF generation
 *  happens fully client-side via @react-pdf/renderer, so there's no server
 *  route or Chrome/Puppeteer dependency to keep alive in production. */
export function PlatformDocumentsTab() {
  const [documents, setDocuments] = useState<PlatformDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listPlatformDocuments()
      .then(setDocuments)
      .catch(() => toast.error("Couldn't load quotes & invoices."))
      .finally(() => setLoading(false));
  }, []);

  function updateLineItem(index: number, patch: Partial<PlatformDocumentLineItem>) {
    setForm((f) => ({ ...f, lineItems: f.lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  }

  function addLineItem() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE_ITEM }] }));
  }

  function removeLineItem(index: number) {
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientName.trim()) {
      setFormError("Enter the client's name.");
      return;
    }
    const cleanedItems = form.lineItems.filter((item) => item.description.trim());
    if (cleanedItems.length === 0) {
      setFormError("Add at least one line item.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const created = await createPlatformDocument({
        docType: form.docType,
        clientName: form.clientName.trim(),
        clientCompany: form.clientCompany.trim() || undefined,
        clientEmail: form.clientEmail.trim() || undefined,
        clientAddress: form.clientAddress.trim() || undefined,
        lineItems: cleanedItems,
        notes: form.notes.trim() || undefined,
        validUntil: form.validUntil || undefined,
      });
      setDocuments((docs) => [created, ...docs]);
      toast.success(`${created.docType === "quote" ? "Quote" : "Invoice"} ${created.docNumber} created`);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch {
      setFormError("Couldn't save this document. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(doc: PlatformDocument, status: PlatformDocumentStatus) {
    try {
      await updatePlatformDocumentStatus(doc.id, status);
      setDocuments((docs) => docs.map((d) => (d.id === doc.id ? { ...d, status } : d)));
    } catch {
      toast.error("Couldn't update status.");
    }
  }

  async function handleDelete(doc: PlatformDocument) {
    try {
      await deletePlatformDocument(doc.id);
      setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
      toast.success(`${doc.docNumber} deleted`);
    } catch {
      toast.error("Couldn't delete this document.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-semibold text-slate-900">Quotes & Invoices</h2>
          <p className="text-xs text-slate-500 mt-0.5">Branded documents for clients reaching out for pricing — not tied to any organization&apos;s own billing.</p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormError("");
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-transform active:scale-[0.97] shrink-0"
        >
          <Plus size={14} />
          New Quote / Invoice
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-10 text-center">Loading…</p>
      ) : documents.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
          <FileText size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No quotes or invoices yet</p>
          <p className="text-xs text-slate-400 mt-1.5">Create one for the next client who asks what a Full-Service event costs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-brand-600/30 hover:shadow-sm transition-all">
              <div className="w-10 h-10 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 shrink-0">
                <FileText size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono font-medium text-slate-900">
                  {doc.docNumber} <span className="font-sans font-normal text-slate-400">· {doc.docType === "quote" ? "Quote" : "Invoice"}</span>
                </p>
                <p className="text-sm text-slate-500 truncate">
                  {doc.clientName}
                  {doc.clientCompany && ` · ${doc.clientCompany}`} · {formatNaira(documentTotal(doc))}
                </p>
              </div>
              <select
                value={doc.status}
                onChange={(e) => handleStatusChange(doc, e.target.value as PlatformDocumentStatus)}
                className={`text-xs font-medium rounded-full px-3 py-1.5 border-0 cursor-pointer shrink-0 ${STATUS_STYLES[doc.status]}`}
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
                <option value="paid">Paid</option>
              </select>
              <div className="flex items-center gap-1 shrink-0">
                <PDFDownloadLink
                  document={<PlatformDocumentPdf doc={doc} logoUrl="/logo-full.png" />}
                  fileName={`${doc.docNumber}-${doc.clientName.replace(/\s+/g, "-")}.pdf`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  {({ loading: pdfLoading }) => (
                    <>
                      <Download size={14} />
                      {pdfLoading ? "…" : "PDF"}
                    </>
                  )}
                </PDFDownloadLink>
                <button
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">New Quote / Invoice</h2>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex gap-2">
                {(["quote", "invoice"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, docType: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.docType === t ? "border-brand-600 bg-brand-600/5 text-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t === "quote" ? "Quote" : "Invoice"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Client name *</label>
                  <input
                    value={form.clientName}
                    onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company</label>
                  <input
                    value={form.clientCompany}
                    onChange={(e) => setForm((f) => ({ ...f, clientCompany: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Client email</label>
                  <input
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Valid until</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Client address</label>
                <input
                  value={form.clientAddress}
                  onChange={(e) => setForm((f) => ({ ...f, clientAddress: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Line items *</label>
                <div className="space-y-2">
                  {form.lineItems.map((item, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(i, { description: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) || 1 })}
                        className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Unit price"
                        value={item.unitPriceNaira}
                        onChange={(e) => updateLineItem(i, { unitPriceNaira: Number(e.target.value) || 0 })}
                        className="w-28 px-2 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                      <button
                        type="button"
                        onClick={() => removeLineItem(i)}
                        disabled={form.lineItems.length === 1}
                        className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addLineItem} className="mt-2 text-xs font-medium text-brand-600 hover:underline flex items-center gap-1">
                  <Plus size={12} />
                  Add line item
                </button>
                <p className="text-right text-sm font-semibold text-slate-900 mt-3">
                  Total: {formatNaira(form.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceNaira, 0))}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="Payment terms, scope details, anything the client should see…"
                />
              </div>

              {formError && <p className="text-sm text-rose-600">{formError}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : `Create ${form.docType === "quote" ? "Quote" : "Invoice"}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
