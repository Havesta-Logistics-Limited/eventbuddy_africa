"use client";

import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";
import { Download, Eye, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import type { PlatformDocument } from "@/lib/types";
import { SCOPE_LIBRARY, defaultProposal, proposalTotal, withProposalDefaults, type ProposalContent } from "@/lib/proposal";
import { savePlatformProposal } from "@/lib/platform-documents";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import { isValidEmail } from "@/lib/validation";
import { PlatformProposalPdf } from "./platform-proposal-pdf";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** Downscales a flyer to a JPEG data URL (longest side 1000px), small enough to keep with the proposal. */
function readFlyer(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file (JPG or PNG)."));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That image is over 15MB. Choose a smaller one."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = url;
  });
}

/** Rows of a few text fields, with add and remove. */
function Rows<T extends Record<string, string | number>>({
  rows,
  fields,
  onChange,
  blank,
  addLabel,
}: {
  rows: T[];
  fields: { key: keyof T; label: string; wide?: boolean; long?: boolean; type?: "number" }[];
  onChange: (rows: T[]) => void;
  blank: T;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="pe-row">
          <div className="pe-row-fields">
            {fields.map((f) =>
              f.long ? (
                <textarea
                  key={String(f.key)}
                  className="eb-input pe-wide min-h-[64px]"
                  value={String(r[f.key] ?? "")}
                  placeholder={f.label}
                  aria-label={f.label}
                  onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))}
                />
              ) : (
                <input
                  key={String(f.key)}
                  className={`eb-input ${f.wide ? "pe-wide" : ""}`}
                  type={f.type === "number" ? "number" : "text"}
                  min={f.type === "number" ? 0 : undefined}
                  inputMode={f.type === "number" ? "numeric" : undefined}
                  value={String(r[f.key] ?? "")}
                  placeholder={f.label}
                  aria-label={f.label}
                  onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value } : x)))}
                />
              )
            )}
          </div>
          <button type="button" className="pe-del" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="pe-add" onClick={() => onChange([...rows, { ...blank }])}>
        <Plus size={14} aria-hidden="true" /> {addLabel}
      </button>
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="pe-section">
      <h3 className="pe-h">
        <span>{n}</span> {title}
      </h3>
      {hint && <p className="pe-hint">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="pe-label">{label}</span>
    {children}
  </label>
);

/**
 * Create or edit a client proposal (platform portal → Quotes & Invoices).
 * Every section starts from eventbuddy's standard proposal and can be changed;
 * the PDF is built in the browser, like quotes and invoices.
 */
export function PlatformProposalEditor({ doc, onClose, onSaved }: { doc: PlatformDocument | null; onClose: () => void; onSaved: (d: PlatformDocument) => void }) {
  const [c, setC] = useState<ProposalContent>(() => (doc ? withProposalDefaults(doc.content) : defaultProposal()));
  const [clientName, setClientName] = useState(doc?.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(doc?.clientEmail ?? "");
  const [validUntil, setValidUntil] = useState(doc?.validUntil ?? "");
  const [saved, setSaved] = useState<PlatformDocument | null>(doc);
  const [busy, setBusy] = useState<"" | "save" | "pdf" | "preview">("");
  const [error, setError] = useState("");
  const [fee, setFee] = useState(DEFAULT_TICKET_FEE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchCurrentTicketFee().then(setFee).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  });

  const set = (patch: Partial<ProposalContent>) => {
    setC((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  // keep the default summary and closing in step with the event name until they've been edited
  function setEventName(name: string) {
    setC((x) => {
      const before = defaultProposal(x.eventName);
      const after = defaultProposal(name);
      return {
        ...x,
        eventName: name,
        summary: x.summary === before.summary ? after.summary : x.summary,
        closing: x.closing === before.closing ? after.closing : x.closing,
      };
    });
    setDirty(true);
  }

  function close() {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  }

  function validate() {
    if (!clientName.trim()) return "Enter who this is for (the client or organiser's name).";
    if (!c.eventName.trim()) return "Enter the event's name.";
    if (clientEmail.trim() && !isValidEmail(clientEmail)) return "Enter a valid email, or leave it blank.";
    if (!c.fees.some((f) => f.item.trim())) return "Add at least one fee.";
    return "";
  }

  async function save(): Promise<PlatformDocument | null> {
    const msg = validate();
    setError(msg);
    if (msg) return null;
    setBusy("save");
    try {
      const d = await savePlatformProposal({ id: saved?.id, clientName: clientName.trim(), clientEmail: clientEmail.trim() || undefined, validUntil: validUntil || undefined, content: c });
      setSaved(d);
      setDirty(false);
      onSaved(d);
      toast.success(`${d.docNumber} saved`);
      return d;
    } catch {
      setError("Couldn't save this proposal. If it's the first one, migration 0125 may need to be run.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function makePdf(mode: "pdf" | "preview") {
    const d = dirty || !saved ? await save() : saved;
    if (!d) return;
    setBusy(mode);
    try {
      const blob = await pdf(<PlatformProposalPdf doc={d} feeLabel={formatTicketFee(fee)} logoUrl="/logo-full.png" />).toBlob();
      const url = URL.createObjectURL(blob);
      if (mode === "preview") window.open(url, "_blank", "noopener");
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${d.docNumber}-eventbuddy-proposal-${(c.eventName || d.clientName).replace(/[^\w]+/g, "-")}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Couldn't build the PDF. Try again.");
    } finally {
      setBusy("");
    }
  }

  const unused = SCOPE_LIBRARY.filter((s) => !c.scope.some((x) => x.title === s.title));

  return (
    <div className="pe-wrap" role="dialog" aria-modal="true" aria-label="Proposal">
      <div className="pe-top">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-fg">{saved ? `${saved.docNumber} · ` : "New proposal · "}{c.eventName || "Untitled event"}</p>
          <p className="text-xs text-muted">{dirty ? "Unsaved changes" : saved ? "Saved" : "Not saved yet"} · fixed fees {naira(proposalTotal(c))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="op-btn" disabled={!!busy} onClick={() => makePdf("preview")}>
            <Eye size={14} aria-hidden="true" /> {busy === "preview" ? "Building…" : "Preview"}
          </button>
          <button type="button" className="op-btn" disabled={!!busy} onClick={() => makePdf("pdf")}>
            <Download size={14} aria-hidden="true" /> {busy === "pdf" ? "Building…" : "PDF"}
          </button>
          <button type="button" className="eb-btn eb-btn--primary" disabled={!!busy} onClick={save}>
            <Save size={14} aria-hidden="true" /> {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button type="button" className="op-close" aria-label="Close" onClick={close}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="pe-body">
        {error && <p className="mb-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

        <Section n={1} title="Client and event" hint="This fills the cover page.">
          <div className="pe-grid">
            <Field label="Event name">
              <input className="eb-input" value={c.eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Lekki Waterside Groove" />
            </Field>
            <Field label="Client / organiser (for your records)">
              <input
                className="eb-input"
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  setDirty(true);
                }}
                placeholder="e.g. Tunde Bakare, Groove Events Ltd"
              />
            </Field>
            <Field label="Client email (optional)">
              <input
                className="eb-input"
                type="email"
                value={clientEmail}
                onChange={(e) => {
                  setClientEmail(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="Valid until (optional)">
              <input
                className="eb-input"
                type="date"
                value={validUntil}
                onChange={(e) => {
                  setValidUntil(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="Event date">
              <input className="eb-input" value={c.eventDate} onChange={(e) => set({ eventDate: e.target.value })} placeholder="e.g. 26 December 2026" />
            </Field>
            <Field label="Event time">
              <input className="eb-input" value={c.eventTime} onChange={(e) => set({ eventTime: e.target.value })} placeholder="e.g. 7:00 PM – 1:00 AM" />
            </Field>
            <Field label="Venue">
              <input className="eb-input" value={c.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="Address and city" />
            </Field>
            <Field label="Attendance target">
              <input className="eb-input" value={c.attendance} onChange={(e) => set({ attendance: e.target.value })} placeholder="e.g. 500+ guests" />
            </Field>
          </div>
          <Field label="Document title">
            <input className="eb-input" value={c.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="'Prepared for' wording (before the event name)">
            <input className="eb-input" value={c.preparedFor} onChange={(e) => set({ preparedFor: e.target.value })} />
          </Field>
          <div>
            <span className="pe-label">Event flyer (optional)</span>
            <div className="flex flex-wrap items-center gap-3">
              {c.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.coverImage} alt="Event flyer" className="h-28 w-auto rounded-lg border border-line" />
              )}
              <label className="pe-add cursor-pointer">
                <ImagePlus size={14} aria-hidden="true" /> {c.coverImage ? "Replace flyer" : "Add flyer"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      set({ coverImage: await readFlyer(f) });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Couldn't use that image.");
                    }
                  }}
                />
              </label>
              {c.coverImage && (
                <button type="button" className="pe-add" onClick={() => set({ coverImage: null })}>
                  <Trash2 size={14} aria-hidden="true" /> Remove
                </button>
              )}
            </div>
          </div>
        </Section>

        <Section n={2} title="Summary">
          <textarea className="eb-input min-h-[110px] w-full" value={c.summary} onChange={(e) => set({ summary: e.target.value })} />
        </Section>

        <Section n={3} title="Scope at a glance" hint="What eventbuddy will deliver. Add more from the list below, or write your own.">
          <Rows rows={c.scope} onChange={(scope) => set({ scope })} blank={{ title: "", text: "" }} addLabel="Add your own" fields={[{ key: "title", label: "Workstream" }, { key: "text", label: "Proposed delivery", long: true }]} />
          {unused.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unused.map((s) => (
                <button key={s.title} type="button" className="pe-chip" onClick={() => set({ scope: [...c.scope, { title: s.title, text: s.text }] })}>
                  <Plus size={12} aria-hidden="true" /> {s.title}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section n={4} title="Commercial quote">
          <span className="pe-label">A. Fixed service fees</span>
          <Rows
            rows={c.fees}
            onChange={(fees) => set({ fees })}
            blank={{ item: "", detail: "", amountNaira: 0 }}
            addLabel="Add a fee"
            fields={[
              { key: "item", label: "Item" },
              { key: "amountNaira", label: "Amount (₦)", type: "number" },
              { key: "detail", label: "Description", long: true },
            ]}
          />
          <p className="text-sm text-fg">Subtotal: <strong>{naira(proposalTotal(c))}</strong></p>
          <Field label="Subtotal note">
            <input className="eb-input" value={c.feesNote} onChange={(e) => set({ feesNote: e.target.value })} />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-fg">
            <input type="checkbox" className="mt-1" checked={c.showTransactionFee} onChange={(e) => set({ showTransactionFee: e.target.checked })} />
            <span>
              Include <strong>B. Platform transaction fees</strong>: {formatTicketFee(fee)} per successful ticket or stand sale (today&apos;s live rate).
            </span>
          </label>
          <span className="pe-label">Items to be confirmed and quoted separately</span>
          <Rows rows={c.separate} onChange={(separate) => set({ separate })} blank={{ title: "", text: "" }} addLabel="Add an item" fields={[{ key: "title", label: "Item" }, { key: "text", label: "Details", long: true }]} />
        </Section>

        <Section n={5} title="Delivery plan">
          <Rows
            rows={c.plan}
            onChange={(plan) => set({ plan })}
            blank={{ stage: "", activity: "", input: "" }}
            addLabel="Add a stage"
            fields={[
              { key: "stage", label: "Stage" },
              { key: "activity", label: "Activity", long: true },
              { key: "input", label: "Organiser input / output", long: true },
            ]}
          />
        </Section>

        <Section n={6} title="Responsibilities and assumptions" hint="One point per line.">
          <Field label="eventbuddy will">
            <textarea className="eb-input min-h-[110px] w-full" value={c.ebWill.join("\n")} onChange={(e) => set({ ebWill: e.target.value.split("\n") })} />
          </Field>
          <Field label="The organisers will">
            <textarea className="eb-input min-h-[130px] w-full" value={c.clientWill.join("\n")} onChange={(e) => set({ clientWill: e.target.value.split("\n") })} />
          </Field>
          <Field label="Planning assumptions">
            <textarea className="eb-input min-h-[90px] w-full" value={c.assumptions} onChange={(e) => set({ assumptions: e.target.value })} />
          </Field>
        </Section>

        <Section n={7} title="Approval and next steps">
          <textarea className="eb-input min-h-[80px] w-full" value={c.approval} onChange={(e) => set({ approval: e.target.value })} />
          <span className="pe-label">Confirmation required</span>
          <Rows rows={c.confirmations} onChange={(confirmations) => set({ confirmations })} blank={{ item: "", status: "To be confirmed" }} addLabel="Add an item" fields={[{ key: "item", label: "What needs confirming", wide: true }, { key: "status", label: "Status" }]} />
          <Field label="Closing line">
            <input className="eb-input" value={c.closing} onChange={(e) => set({ closing: e.target.value })} />
          </Field>
          <Field label="Commercial note (small print)">
            <textarea className="eb-input min-h-[70px] w-full" value={c.note} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </Section>
      </div>
    </div>
  );
}
