"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, Clock, Copy, Edit2, FileEdit, Lightbulb, Mail, Percent, Plus, Tag, Ticket, TrendingUp, Trash2, Users, X } from "lucide-react";
import { DiscountCode, DiscountRedemption, EventRecord, RegistrationFormStart, TicketPurchaseAttempt, TicketType } from "@/lib/types";
import {
  PersistError,
  addDiscountCode,
  addTicketType,
  deleteDiscountCode,
  deleteTicketType,
  getDiscountCodeRedemptions,
  getEventFormStarts,
  getEventTicketTransactions,
  updateDiscountCode,
  updateTicketType,
  useRegistrations,
} from "@/lib/store";
import { formatNaira } from "@/lib/billing";

/** "3 hours ago" / "2 days ago" — coarse enough for an abandoned-checkout list,
 *  no need to pull in a date library for one label. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type DropRow = { key: string; email: string; name?: string; ticketId?: string | null; ticketName?: string | null; tone?: string; amountNaira?: number; note?: string; when: string };

/** A drop-off list (abandoned checkouts, unsent forms) as a follow-up panel:
 *  what's at stake in the header, one row per person with Email and Copy. */
function DropOffPanel({
  accent,
  icon,
  title,
  summary,
  tip,
  rows,
  open,
  onToggle,
  onCopyAll,
  mailSubject,
}: {
  accent: "amber" | "violet";
  icon: React.ReactNode;
  title: string;
  /** Gets the rows currently shown, so totals follow the ticket filter. */
  summary: (visible: DropRow[]) => React.ReactNode;
  tip: string;
  rows: DropRow[];
  open: boolean;
  onToggle: () => void;
  onCopyAll: (emails: string[]) => void;
  mailSubject: string;
}) {
  const panelId = `drop-${accent}`;
  // Ticket filter: one chip per ticket type that appears in the list, plus
  // "No ticket chosen" for form drop-offs who never picked one.
  const [filter, setFilter] = useState<string>("all");
  const options: { id: string; label: string; tone?: string; count: number }[] = [];
  for (const r of rows) {
    const id = r.ticketId ?? "none";
    const existing = options.find((o) => o.id === id);
    if (existing) existing.count++;
    else options.push({ id, label: r.ticketName || "No ticket chosen", tone: r.tone, count: 1 });
  }
  const active = filter !== "all" && options.some((o) => o.id === filter) ? filter : "all";
  const visible = active === "all" ? rows : rows.filter((r) => (r.ticketId ?? "none") === active);
  return (
    <section className="eb-drop" data-accent={accent} data-open={open || undefined}>
      <div className="eb-drop-head">
        <button type="button" className="eb-drop-toggle" onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
          <span className="eb-drop-icon" aria-hidden="true">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="eb-drop-title">
              {title} <span className="eb-drop-count">{visible.length}</span>
            </span>
            <span className="eb-drop-sub block">{summary(visible)}</span>
          </span>
          <ChevronDown size={18} className="eb-drop-chev" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onCopyAll(visible.map((r) => r.email))} className="eb-drop-copyall">
          <Copy size={14} aria-hidden="true" /> {active === "all" ? "Copy all emails" : `Copy ${visible.length} email${visible.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {open && (
        <div id={panelId} className="eb-drop-body">
          <p className="eb-drop-tip">
            <Lightbulb size={14} className="mt-0.5 shrink-0" style={{ color: "var(--dp-a)" }} aria-hidden="true" />
            {tip}
          </p>
          <div className="eb-drop-filters" role="group" aria-label="Filter by ticket type">
            <button type="button" className="eb-drop-filter" aria-pressed={active === "all"} onClick={() => setFilter("all")}>
              All tickets <span>{rows.length}</span>
            </button>
            {options.map((o) => (
              <button key={o.id} type="button" className="eb-drop-filter" data-tone={o.tone} aria-pressed={active === o.id} onClick={() => setFilter(o.id)}>
                {o.id !== "none" && <Ticket size={11} aria-hidden="true" />}
                {o.label} <span>{o.count}</span>
              </button>
            ))}
          </div>
          <ul className="eb-drop-list">
            {visible.map((r, i) => (
              <li key={r.key} className="eb-drop-row" data-tone={r.tone} style={{ ["--i" as string]: i }}>
                <span className="eb-drop-avatar" aria-hidden="true">{(r.name || r.email).trim().charAt(0) || "?"}</span>
                <div className="eb-drop-who">
                  <p className="eb-drop-name">{r.name || r.email}</p>
                  <p className="eb-drop-meta">
                    {r.name && <span className="truncate">{r.email}</span>}
                    {r.ticketName && (
                      <span className="eb-drop-ticket">
                        <Ticket size={10} aria-hidden="true" /> {r.ticketName}
                      </span>
                    )}
                    {r.note && <span>{r.note}</span>}
                  </p>
                </div>
                <div className="eb-drop-amt">
                  {r.amountNaira != null && <b>{formatNaira(r.amountNaira)}</b>}
                  <span>{timeAgo(r.when)}</span>
                </div>
                <div className="eb-drop-acts">
                  <a className="eb-drop-act" href={`mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(mailSubject)}`}>
                    <Mail size={13} aria-hidden="true" /> Email
                  </a>
                  <button
                    type="button"
                    className="eb-drop-act eb-drop-act--icon"
                    aria-label={`Copy ${r.email}`}
                    onClick={() => {
                      navigator.clipboard.writeText(r.email);
                      toast.success("Email copied");
                    }}
                  >
                    <Copy size={13} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Ticket cards cycle through the brand orb colours (globals.css .eb-tt).
const TICKET_TONES = ["pink", "violet", "orange", "indigo"] as const;
const EMPTY_FORM = { id: "", name: "", description: "", priceNaira: "0", quantityAvailable: "", groupSize: "1" };
const EMPTY_CODE_FORM = {
  id: "",
  code: "",
  discountType: "percentage" as DiscountCode["discountType"],
  discountValue: "",
  scope: "all" as "all" | "specific",
  ticketTypeIds: [] as string[],
  perCustomerLimit: "unlimited" as DiscountCode["perCustomerLimit"],
  maxUses: "",
  minSpendNaira: "",
  maxDiscountNaira: "",
  startsAt: "",
  endsAt: "",
};

/** ISO string → the local-time value a `<input type="datetime-local">` expects
 *  (YYYY-MM-DDTHH:mm), using the browser's own timezone so an edited code shows
 *  the same wall-clock time the admin originally picked. */
function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Admin-side ticket-type management for an event — free tickets (priceNaira 0) register
 *  attendees instantly, exactly like before ticketing existed; paid ones route the
 *  attendee through a real Paystack split payment first (see the public register page
 *  and /api/orgs/[slug]/ticket-purchase/initialize). Requires payouts to be set up
 *  (Settings → Payouts) before a paid ticket type can actually be sold. */
export function TicketsTab({
  event,
  ticketTypes,
  discountCodes,
  hasPayoutsConfigured,
}: {
  event: EventRecord;
  ticketTypes: TicketType[];
  discountCodes: DiscountCode[];
  hasPayoutsConfigured: boolean;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [codeForm, setCodeForm] = useState(EMPTY_CODE_FORM);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [codeFormError, setCodeFormError] = useState("");
  const [savingCode, setSavingCode] = useState(false);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const discountValue = Number(codeForm.discountValue);
    const maxUses = codeForm.maxUses.trim() ? Number(codeForm.maxUses) : null;
    const minSpendNaira = codeForm.minSpendNaira.trim() ? Number(codeForm.minSpendNaira) : null;
    const maxDiscountNaira = codeForm.maxDiscountNaira.trim() ? Number(codeForm.maxDiscountNaira) : null;
    if (!codeForm.code.trim()) {
      setCodeFormError("Give this code a name, e.g. SAVE20.");
      return;
    }
    if (!(discountValue > 0) || (codeForm.discountType === "percentage" && discountValue > 100)) {
      setCodeFormError(codeForm.discountType === "percentage" ? "Enter a percentage between 1 and 100." : "Enter a discount amount greater than 0.");
      return;
    }
    if (codeForm.scope === "specific" && codeForm.ticketTypeIds.length === 0) {
      setCodeFormError("Select at least one ticket type, or switch to \"All ticket types.\"");
      return;
    }
    setCodeFormError("");
    setSavingCode(true);
    try {
      const payload = {
        eventId: event.id,
        code: codeForm.code.trim().toUpperCase(),
        discountType: codeForm.discountType,
        discountValue,
        ticketTypeIds: codeForm.scope === "specific" ? codeForm.ticketTypeIds : null,
        perCustomerLimit: codeForm.perCustomerLimit,
        maxUses,
        minSpendNaira,
        maxDiscountNaira,
        startsAt: codeForm.startsAt ? new Date(codeForm.startsAt).toISOString() : null,
        endsAt: codeForm.endsAt ? new Date(codeForm.endsAt).toISOString() : null,
      };
      if (codeForm.id) await updateDiscountCode(codeForm.id, payload);
      else await addDiscountCode(payload);
      toast.success(codeForm.id ? "Discount code updated" : "Discount code added");
      setShowCodeForm(false);
      setCodeForm(EMPTY_CODE_FORM);
    } catch (err) {
      setCodeFormError(err instanceof PersistError ? err.message : "Couldn't save this code. Please try again.");
    } finally {
      setSavingCode(false);
    }
  }

  async function handleDeleteCode(id: string, code: string) {
    try {
      await deleteDiscountCode(id);
      toast.success(`${code} removed`);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't remove this code. Please try again.");
    }
  }

  const [usageCode, setUsageCode] = useState<DiscountCode | null>(null);
  const [redemptions, setRedemptions] = useState<DiscountRedemption[]>([]);
  const [loadingRedemptions, setLoadingRedemptions] = useState(false);

  const [transactions, setTransactions] = useState<TicketPurchaseAttempt[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getEventTicketTransactions(event.id)
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTransactions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const successfulTxns = transactions.filter((t) => t.status === "success");
  const abandonedTxns = transactions.filter((t) => t.status === "pending");
  const totalRevenueNaira = successfulTxns.reduce((sum, t) => sum + t.amountNaira, 0);
  const revenueByTicketType = new Map<string, number>();
  for (const t of successfulTxns) {
    if (!t.ticketTypeId) continue;
    revenueByTicketType.set(t.ticketTypeId, (revenueByTicketType.get(t.ticketTypeId) ?? 0) + t.amountNaira);
  }
  const discountGivenByCode = new Map<string, number>();
  for (const t of successfulTxns) {
    if (!t.discountCodeId || !t.ticketTypeId) continue;
    const listedPrice = ticketTypes.find((tt) => tt.id === t.ticketTypeId)?.priceNaira ?? 0;
    const savedNaira = Math.max(0, listedPrice - t.amountNaira);
    discountGivenByCode.set(t.discountCodeId, (discountGivenByCode.get(t.discountCodeId) ?? 0) + savedNaira);
  }
  const totalDiscountGiven = Array.from(discountGivenByCode.values()).reduce((sum, v) => sum + v, 0);
  const hasPaidTicketTypes = ticketTypes.some((t) => t.priceNaira > 0);

  function copyAbandonedEmails(list: string[]) {
    const emails = Array.from(new Set(list.filter((e) => e && e !== "—")));
    navigator.clipboard.writeText(emails.join(", "));
    toast.success(`Copied ${emails.length} email${emails.length !== 1 ? "s" : ""}`);
  }

  const [formStarts, setFormStarts] = useState<RegistrationFormStart[]>([]);
  useEffect(() => {
    let cancelled = false;
    getEventFormStarts(event.id)
      .then((rows) => {
        if (!cancelled) setFormStarts(rows);
      })
      .catch(() => {
        if (!cancelled) setFormStarts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  // A form-start row means "typed an email" — not "never went any further."
  // Excluding anyone who already has a real registration or ANY paystack
  // transaction (any status, since even "pending" means they reached
  // checkout, a further stage the section below already covers) keeps this
  // list to genuine never-submitted drop-offs, not double-counted ones.
  const allRegistrations = useRegistrations();
  const completedOrCheckedOutEmails = new Set<string>([
    ...allRegistrations.filter((r) => r.eventId === event.id).map((r) => r.email.toLowerCase()),
    ...transactions.map((t) => t.email.toLowerCase()),
  ]);
  const neverSubmitted = formStarts.filter((f) => !completedOrCheckedOutEmails.has(f.email.toLowerCase()));

  const [showAbandonedCheckouts, setShowAbandonedCheckouts] = useState(false);
  const [showFormStarts, setShowFormStarts] = useState(false);

  function copyFormStartEmails(list: string[]) {
    const emails = Array.from(new Set(list));
    navigator.clipboard.writeText(emails.join(", "));
    toast.success(`Copied ${emails.length} email${emails.length !== 1 ? "s" : ""}`);
  }

  async function handleViewUsage(code: DiscountCode) {
    setUsageCode(code);
    setLoadingRedemptions(true);
    try {
      setRedemptions(await getDiscountCodeRedemptions(code.id));
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't load usage for this code.");
      setRedemptions([]);
    } finally {
      setLoadingRedemptions(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNaira = Number(form.priceNaira) || 0;
    const quantityAvailable = form.quantityAvailable.trim() ? Number(form.quantityAvailable) : null;
    const groupSize = Math.floor(Number(form.groupSize) || 1);
    if (!form.name.trim()) {
      setFormError("Give this ticket a name.");
      return;
    }
    if (groupSize < 1 || groupSize > 20) {
      setFormError("A ticket can admit between 1 and 20 people.");
      return;
    }
    // Group bundles go through checkout (each guest is named and gets their own
    // QR), so they need a price and an in-person event with door check-in.
    if (groupSize > 1 && priceNaira <= 0) {
      setFormError("Group tickets need a price. For free group entry, add a free single ticket instead.");
      return;
    }
    if (groupSize > 1 && event.eventFormat === "virtual") {
      setFormError("Group tickets are for in-person events, where each guest checks in at the door.");
      return;
    }
    if (priceNaira > 0 && !hasPayoutsConfigured) {
      setFormError("Set up payouts (Settings → Payouts) before creating a paid ticket.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = { eventId: event.id, name: form.name.trim(), description: form.description.trim(), priceNaira, quantityAvailable, groupSize };
      if (form.id) await updateTicketType(form.id, payload);
      else await addTicketType(payload);
      toast.success(form.id ? "Ticket type updated" : "Ticket type added");
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save this ticket type. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteTicketType(id);
      toast.success(`${name} removed`);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't remove this ticket type. Please try again.");
    }
  }

  return (
    <div>
      {!hasPayoutsConfigured && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-500/10 text-amber-200 text-sm">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            Payouts aren&apos;t set up for this organization yet — free tickets still work, but a paid ticket type can&apos;t be created until you add
            a payout bank account.{" "}
            <Link href="/admin?tab=payouts" className="font-medium underline hover:no-underline">
              Set up payouts now
            </Link>
          </span>
        </div>
      )}

      {hasPaidTicketTypes && !loadingTransactions && (
        <div className="mb-6">
          <h2 className="font-semibold text-fg mb-3">Sales overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="bg-surface rounded-xl border border-line p-4">
              <p className="text-xs text-muted flex items-center gap-1.5 mb-1">
                <TrendingUp size={13} />
                Total revenue
              </p>
              <p className="text-xl font-semibold text-fg">{formatNaira(totalRevenueNaira)}</p>
              <p className="text-xs text-subtle mt-0.5">{successfulTxns.length} paid ticket{successfulTxns.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="bg-surface rounded-xl border border-line p-4">
              <p className="text-xs text-muted flex items-center gap-1.5 mb-1">
                <Tag size={13} />
                Discounts given
              </p>
              <p className="text-xl font-semibold text-fg">{formatNaira(totalDiscountGiven)}</p>
              <p className="text-xs text-subtle mt-0.5">across {discountGivenByCode.size} code{discountGivenByCode.size !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {revenueByTicketType.size > 0 && (
            <div className="bg-surface rounded-xl border border-line p-4 space-y-2">
              <p className="text-xs font-medium text-muted mb-1">Revenue by ticket type</p>
              {ticketTypes
                .filter((t) => revenueByTicketType.has(t.id))
                .map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-fg-2">{t.name}</span>
                    <span className="font-medium text-fg">{formatNaira(revenueByTicketType.get(t.id) ?? 0)}</span>
                  </div>
                ))}
            </div>
          )}

          {abandonedTxns.length > 0 && (
            <div className="mt-3">
              <DropOffPanel
                accent="amber"
                icon={<Clock size={20} strokeWidth={2.4} />}
                title="Started checkout, never paid"
                summary={(visible) => (
                  <>
                    <strong>{formatNaira(visible.reduce((sum, r) => sum + (r.amountNaira ?? 0), 0))}</strong> left unpaid at checkout
                  </>
                )}
                tip="Good candidates for a follow-up email, especially if you add a discount code after they dropped off."
                rows={abandonedTxns.map((t, i) => {
                  const idx = ticketTypes.findIndex((tt) => tt.id === t.ticketTypeId);
                  return {
                    key: `${t.email}-${t.createdAt}-${i}`,
                    email: t.email,
                    name: t.fullName && t.fullName !== "—" ? t.fullName : undefined,
                    ticketId: t.ticketTypeId,
                    ticketName: idx >= 0 ? ticketTypes[idx].name : "Ticket",
                    tone: idx >= 0 ? TICKET_TONES[idx % TICKET_TONES.length] : undefined,
                    amountNaira: t.amountNaira,
                    note: t.discountCodeId ? "tried a discount code" : undefined,
                    when: t.createdAt,
                  };
                })}
                open={showAbandonedCheckouts}
                onToggle={() => setShowAbandonedCheckouts((v) => !v)}
                onCopyAll={copyAbandonedEmails}
                mailSubject={`Your ${event.name} ticket is still waiting`}
              />
            </div>
          )}
        </div>
      )}

      {neverSubmitted.length > 0 && (
        <div className="mb-6">
          <DropOffPanel
            accent="violet"
            icon={<FileEdit size={20} strokeWidth={2.4} />}
            title="Started the form, never submitted"
            summary={() => "Typed an email into the registration form, then left before checkout"}
            tip="They showed interest but never reached checkout. A short reminder with the event link often brings them back."
            rows={neverSubmitted.map((f, i) => {
              const idx = f.ticketTypeId ? ticketTypes.findIndex((tt) => tt.id === f.ticketTypeId) : -1;
              return {
                key: `${f.email}-${i}`,
                email: f.email,
                name: f.fullName || undefined,
                ticketId: idx >= 0 ? f.ticketTypeId : null,
                ticketName: idx >= 0 ? ticketTypes[idx].name : null,
                tone: idx >= 0 ? TICKET_TONES[idx % TICKET_TONES.length] : undefined,
                note: idx >= 0 ? "was looking at this" : undefined,
                when: f.updatedAt,
              };
            })}
            open={showFormStarts}
            onToggle={() => setShowFormStarts((v) => !v)}
            onCopyAll={copyFormStartEmails}
            mailSubject={`Finish registering for ${event.name}`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-fg">
          Ticket types ({ticketTypes.length})
        </h2>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormError("");
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-transform active:scale-[0.97] shrink-0"
        >
          <Plus size={14} />
          Add Ticket Type
        </button>
      </div>

      {ticketTypes.length === 0 ? (
        <div className="bg-canvas border border-line rounded-xl p-10 text-center">
          <Ticket size={28} className="mx-auto mb-3 text-faint" />
          <p className="font-medium text-muted">No ticket types yet</p>
          <p className="text-xs text-subtle mt-1.5">
            Without one, registration is free and unlimited — add a ticket type to cap capacity or charge for attendance.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ticketTypes.map((t, i) => {
            const isGroup = t.groupSize > 1;
            const cap = t.quantityAvailable;
            const pct = cap ? Math.min(100, Math.round((t.quantitySold / cap) * 100)) : 0;
            const edit = () => {
              setForm({
                id: t.id,
                name: t.name,
                description: t.description || "",
                priceNaira: String(t.priceNaira),
                quantityAvailable: t.quantityAvailable != null ? String(t.quantityAvailable) : "",
                groupSize: String(t.groupSize ?? 1),
              });
              setFormError("");
              setShowForm(true);
            };
            return (
              <article key={t.id} className="eb-tt" data-tone={TICKET_TONES[i % TICKET_TONES.length]} style={{ ["--i" as string]: i }}>
                <div className="eb-tt-stub">
                  <span className="eb-tt-stub-icon" aria-hidden="true">
                    {isGroup ? <Users size={17} /> : <Ticket size={17} />}
                  </span>
                  <div>
                    <p className="eb-tt-price">{t.priceNaira > 0 ? formatNaira(t.priceNaira) : "Free"}</p>
                    {isGroup && t.priceNaira > 0 && <p className="eb-tt-per">{formatNaira(Math.round(t.priceNaira / t.groupSize))} per person</p>}
                  </div>
                </div>
                <div className="eb-tt-perf" aria-hidden="true" />
                <div className="eb-tt-body">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="eb-tt-name">{t.name}</h3>
                      {isGroup && (
                        <span className="eb-tt-chip">
                          <Users size={11} aria-hidden="true" /> Admits {t.groupSize}
                        </span>
                      )}
                    </div>
                    {t.description && <p className="eb-tt-desc">{t.description}</p>}
                  </div>
                  <div>
                    {cap != null && (
                      <div className="eb-tt-bar" role="progressbar" aria-label={`${t.name} sold`} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={t.quantitySold}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <p className="eb-tt-meta mt-2">
                      <span>
                        <strong className="font-semibold text-fg">{t.quantitySold}</strong> {isGroup ? "groups" : "sold"}
                        {cap != null ? ` of ${cap}` : " · unlimited"}
                      </span>
                      {cap != null && <span>{cap - t.quantitySold > 0 ? `${cap - t.quantitySold} left` : "Sold out"}</span>}
                    </p>
                  </div>
                </div>
                <div className="eb-tt-actions">
                  <button type="button" onClick={edit} className="eb-tt-act" aria-label={`Edit ${t.name}`}>
                    <Edit2 size={15} />
                  </button>
                  <button type="button" onClick={() => handleDelete(t.id, t.name)} className="eb-tt-act eb-tt-act--danger" aria-label={`Delete ${t.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-10 mb-4">
        <h2 className="font-semibold text-fg">Discount codes ({discountCodes.length})</h2>
        <button
          onClick={() => {
            setCodeForm(EMPTY_CODE_FORM);
            setCodeFormError("");
            setShowCodeForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-transform active:scale-[0.97] shrink-0"
        >
          <Plus size={14} />
          Add Discount Code
        </button>
      </div>

      {discountCodes.length === 0 ? (
        <div className="bg-canvas border border-line rounded-xl p-10 text-center">
          <Tag size={28} className="mx-auto mb-3 text-faint" />
          <p className="font-medium text-muted">No discount codes yet</p>
          <p className="text-xs text-subtle mt-1.5">A code applies to every paid ticket type on this event — great for early-bird or group pricing.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {discountCodes.map((d, i) => {
            const given = discountGivenByCode.get(d.id) ?? 0;
            const usePct = d.maxUses ? Math.min(100, Math.round((d.usesCount / d.maxUses) * 100)) : 0;
            const scoped = d.ticketTypeIds && d.ticketTypeIds.length > 0 ? ticketTypes.filter((tt) => d.ticketTypeIds!.includes(tt.id)) : null;
            return (
              <article key={d.id} className="eb-tt" data-tone="mint" style={{ ["--i" as string]: i }}>
                <div className="eb-tt-stub">
                  <span className="eb-tt-stub-icon" aria-hidden="true">
                    {d.discountType === "percentage" ? <Percent size={17} /> : <Tag size={17} />}
                  </span>
                  <div>
                    <p className="eb-tt-price">{d.discountType === "percentage" ? `${d.discountValue}%` : formatNaira(d.discountValue)}</p>
                    <p className="eb-tt-off mt-1">off{d.maxDiscountNaira != null ? ` · max ${formatNaira(d.maxDiscountNaira)}` : ""}</p>
                  </div>
                </div>
                <div className="eb-tt-perf" aria-hidden="true" />
                <div className="eb-tt-body">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="eb-code"
                      title="Copy code"
                      onClick={() => {
                        navigator.clipboard.writeText(d.code);
                        toast.success(`Copied ${d.code}`);
                      }}
                    >
                      {d.code} <Copy size={13} aria-hidden="true" />
                    </button>
                    {given > 0 && <span className="eb-tt-chip">{formatNaira(given)} given</span>}
                  </div>
                  <div className="eb-tt-rules">
                    {scoped ? (
                      scoped.map((tt) => (
                        <span key={tt.id} className="eb-tt-rule" data-tone={TICKET_TONES[ticketTypes.indexOf(tt) % TICKET_TONES.length]}>
                          {tt.name}
                        </span>
                      ))
                    ) : (
                      <span className="eb-tt-rule">All ticket types</span>
                    )}
                    {d.perCustomerLimit === "single" && <span className="eb-tt-rule">Once per customer</span>}
                    {d.minSpendNaira != null && <span className="eb-tt-rule">Min. {formatNaira(d.minSpendNaira)} ticket</span>}
                    {d.startsAt && <span className="eb-tt-rule">From {new Date(d.startsAt).toLocaleDateString()}</span>}
                    {d.endsAt && <span className="eb-tt-rule">Until {new Date(d.endsAt).toLocaleDateString()}</span>}
                  </div>
                  <div>
                    {d.maxUses != null && (
                      <div className="eb-tt-bar" role="progressbar" aria-label={`${d.code} uses`} aria-valuemin={0} aria-valuemax={d.maxUses} aria-valuenow={d.usesCount}>
                        <span style={{ width: `${usePct}%` }} />
                      </div>
                    )}
                    <p className="eb-tt-meta mt-2">
                      <span>
                        <strong className="font-semibold text-fg">{d.usesCount}</strong> used{d.maxUses != null ? ` of ${d.maxUses}` : " · unlimited"}
                      </span>
                      {d.maxUses != null && <span>{d.maxUses - d.usesCount > 0 ? `${d.maxUses - d.usesCount} left` : "Used up"}</span>}
                    </p>
                  </div>
                </div>
                <div className="eb-tt-actions">
                  <button
                    type="button"
                    onClick={() => handleViewUsage(d)}
                    disabled={d.usesCount === 0}
                    title={d.usesCount === 0 ? "No redemptions yet" : "View who used this code"}
                    className="eb-tt-act eb-tt-act--text"
                    aria-label={`Usage for ${d.code}`}
                  >
                    <Users size={15} aria-hidden="true" />
                    <span>Usage</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                    setCodeForm({
                      id: d.id,
                      code: d.code,
                      discountType: d.discountType,
                      discountValue: String(d.discountValue),
                      scope: d.ticketTypeIds && d.ticketTypeIds.length > 0 ? "specific" : "all",
                      ticketTypeIds: d.ticketTypeIds ?? [],
                      perCustomerLimit: d.perCustomerLimit,
                      maxUses: d.maxUses != null ? String(d.maxUses) : "",
                      minSpendNaira: d.minSpendNaira != null ? String(d.minSpendNaira) : "",
                      maxDiscountNaira: d.maxDiscountNaira != null ? String(d.maxDiscountNaira) : "",
                      startsAt: d.startsAt ? toDatetimeLocalValue(d.startsAt) : "",
                      endsAt: d.endsAt ? toDatetimeLocalValue(d.endsAt) : "",
                    });
                    setCodeFormError("");
                    setShowCodeForm(true);
                    }}
                    className="eb-tt-act"
                    aria-label={`Edit ${d.code}`}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button type="button" onClick={() => handleDeleteCode(d.id, d.code)} className="eb-tt-act eb-tt-act--danger" aria-label={`Delete ${d.code}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showCodeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-surface rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-line-soft">
              <h2 className="font-semibold text-fg">{codeForm.id ? "Edit Discount Code" : "Add Discount Code"}</h2>
              <button onClick={() => setShowCodeForm(false)}>
                <X size={20} className="text-subtle" />
              </button>
            </div>
            <form onSubmit={handleCodeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">Code</label>
                <input
                  required
                  value={codeForm.code}
                  onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                  placeholder="e.g. EARLYBIRD"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Discount type</label>
                  <select
                    value={codeForm.discountType}
                    onChange={(e) => setCodeForm({ ...codeForm, discountType: e.target.value as DiscountCode["discountType"] })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-surface"
                  >
                    <option value="percentage">Percentage off</option>
                    <option value="fixed">Fixed amount off</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">
                    {codeForm.discountType === "percentage" ? "Percentage" : "Amount (₦)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={codeForm.discountType === "percentage" ? 100 : undefined}
                    step="1"
                    value={codeForm.discountValue}
                    onChange={(e) => setCodeForm({ ...codeForm, discountValue: e.target.value })}
                    placeholder={codeForm.discountType === "percentage" ? "e.g. 20" : "e.g. 5000"}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">Applies to</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-sm text-fg-2">
                    <input
                      type="radio"
                      checked={codeForm.scope === "all"}
                      onChange={() => setCodeForm({ ...codeForm, scope: "all", ticketTypeIds: [] })}
                      className="text-brand-500 focus:ring-brand-600"
                    />
                    All ticket types
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-fg-2">
                    <input
                      type="radio"
                      checked={codeForm.scope === "specific"}
                      onChange={() => setCodeForm({ ...codeForm, scope: "specific" })}
                      className="text-brand-500 focus:ring-brand-600"
                    />
                    Specific ticket types
                  </label>
                </div>
                {codeForm.scope === "specific" && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-line bg-canvas">
                    {ticketTypes.length === 0 ? (
                      <p className="text-xs text-subtle">No ticket types on this event yet.</p>
                    ) : (
                      ticketTypes.map((t) => {
                        const checked = codeForm.ticketTypeIds.includes(t.id);
                        return (
                          <label
                            key={t.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                              checked ? "bg-brand-600 text-white border-brand-600" : "bg-surface text-fg-3 border-line"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setCodeForm({
                                  ...codeForm,
                                  ticketTypeIds: checked ? codeForm.ticketTypeIds.filter((id) => id !== t.id) : [...codeForm.ticketTypeIds, t.id],
                                })
                              }
                              className="hidden"
                            />
                            {t.name}
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">Per-customer limit</label>
                <select
                  value={codeForm.perCustomerLimit}
                  onChange={(e) => setCodeForm({ ...codeForm, perCustomerLimit: e.target.value as DiscountCode["perCustomerLimit"] })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-surface"
                >
                  <option value="unlimited">Multiple uses per customer</option>
                  <option value="single">Once per customer</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">
                    Max total uses <span className="text-subtle font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={codeForm.maxUses}
                    onChange={(e) => setCodeForm({ ...codeForm, maxUses: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">
                    Max discount <span className="text-subtle font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={codeForm.maxDiscountNaira}
                    onChange={(e) => setCodeForm({ ...codeForm, maxDiscountNaira: e.target.value })}
                    placeholder="No cap"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">
                  Minimum ticket price to qualify <span className="text-subtle font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={codeForm.minSpendNaira}
                  onChange={(e) => setCodeForm({ ...codeForm, minSpendNaira: e.target.value })}
                  placeholder="No minimum"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">
                    Starts <span className="text-subtle font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={codeForm.startsAt}
                    onChange={(e) => setCodeForm({ ...codeForm, startsAt: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">
                    Ends <span className="text-subtle font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={codeForm.endsAt}
                    onChange={(e) => setCodeForm({ ...codeForm, endsAt: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              {codeFormError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {codeFormError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCodeForm(false)} className="flex-1 py-2.5 rounded-lg border border-line text-sm font-medium text-fg-3 hover:bg-canvas">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCode}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-transform active:scale-[0.97]"
                >
                  {savingCode ? "Saving…" : codeForm.id ? "Save Changes" : "Add Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-surface rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-line-soft">
              <h2 className="font-semibold text-fg">{form.id ? "Edit Ticket Type" : "Add Ticket Type"}</h2>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-subtle" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. General Admission"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">
                  Description <span className="text-subtle font-normal">(optional)</span>
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Price (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.priceNaira}
                    onChange={(e) => setForm({ ...form, priceNaira: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">
                    Quantity <span className="text-subtle font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.quantityAvailable}
                    onChange={(e) => setForm({ ...form, quantityAvailable: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1.5">
                  Admits <span className="text-subtle font-normal">(people per ticket)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={form.groupSize}
                  onChange={(e) => setForm({ ...form, groupSize: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <p className="mt-1.5 text-xs text-subtle">
                  {Number(form.groupSize) > 1
                    ? `A group ticket: one purchase admits ${Math.floor(Number(form.groupSize))} people. The buyer names every guest, and each gets their own QR code. Quantity counts groups, not people.`
                    : "1 for a normal ticket. Set 2 or more to sell a group bundle, e.g. \u201cSquad of 4\u201d."}
                </p>
              </div>
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-line text-sm font-medium text-fg-3 hover:bg-canvas">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-transform active:scale-[0.97]"
                >
                  {saving ? "Saving…" : form.id ? "Save Changes" : "Add Ticket Type"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {usageCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop" onClick={() => setUsageCode(null)}>
          <div className="bg-surface rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-line-soft">
              <div>
                <h2 className="font-semibold text-fg">
                  Usage — <span className="font-mono">{usageCode.code}</span>
                </h2>
                <p className="text-xs text-subtle mt-0.5">
                  {usageCode.usesCount} redemption{usageCode.usesCount !== 1 ? "s" : ""}
                  {usageCode.maxUses != null && ` of ${usageCode.maxUses}`}
                </p>
              </div>
              <button onClick={() => setUsageCode(null)}>
                <X size={20} className="text-subtle" />
              </button>
            </div>
            <div className="p-6">
              {loadingRedemptions ? (
                <p className="text-sm text-subtle text-center py-6">Loading…</p>
              ) : redemptions.length === 0 ? (
                <p className="text-sm text-subtle text-center py-6">No redemptions yet.</p>
              ) : (
                <div className="space-y-3">
                  {redemptions.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 pb-3 border-b border-line-soft last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium text-fg text-sm truncate">{r.fullName}</p>
                        <p className="text-xs text-muted truncate">{r.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-fg">{formatNaira(r.amountPaidNaira)}</p>
                        <p className="text-xs text-subtle">{new Date(r.purchasedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
