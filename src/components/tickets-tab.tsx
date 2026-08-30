"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Clock, Copy, DollarSign, Edit2, FileEdit, Percent, Plus, Tag, Ticket, TrendingUp, Trash2, Users, X } from "lucide-react";
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

const EMPTY_FORM = { id: "", name: "", description: "", priceNaira: "0", quantityAvailable: "" };
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

  function copyAbandonedEmails() {
    const emails = Array.from(new Set(abandonedTxns.map((t) => t.email).filter((e) => e && e !== "—")));
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

  function copyFormStartEmails() {
    const emails = Array.from(new Set(neverSubmitted.map((f) => f.email)));
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
    if (!form.name.trim()) {
      setFormError("Give this ticket a name.");
      return;
    }
    if (priceNaira > 0 && !hasPayoutsConfigured) {
      setFormError("Set up payouts (Settings → Payouts) before creating a paid ticket.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = { eventId: event.id, name: form.name.trim(), description: form.description.trim(), priceNaira, quantityAvailable };
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
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          Payouts aren&apos;t set up for this organization yet — free tickets still work, but a paid ticket type can&apos;t be created until you add
          a payout bank account in Settings → Payouts.
        </div>
      )}

      {hasPaidTicketTypes && !loadingTransactions && (
        <div className="mb-6">
          <h2 className="font-semibold text-slate-800 mb-3">Sales overview</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
                <TrendingUp size={13} />
                Total revenue
              </p>
              <p className="text-xl font-semibold text-slate-900">{formatNaira(totalRevenueNaira)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{successfulTxns.length} paid ticket{successfulTxns.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
                <Tag size={13} />
                Discounts given
              </p>
              <p className="text-xl font-semibold text-slate-900">{formatNaira(totalDiscountGiven)}</p>
              <p className="text-xs text-slate-400 mt-0.5">across {discountGivenByCode.size} code{discountGivenByCode.size !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {revenueByTicketType.size > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 mb-1">Revenue by ticket type</p>
              {ticketTypes
                .filter((t) => revenueByTicketType.has(t.id))
                .map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{t.name}</span>
                    <span className="font-medium text-slate-900">{formatNaira(revenueByTicketType.get(t.id) ?? 0)}</span>
                  </div>
                ))}
            </div>
          )}

          {abandonedTxns.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                  <Clock size={14} className="text-amber-500" />
                  Started checkout, never paid ({abandonedTxns.length})
                </p>
                <button
                  onClick={copyAbandonedEmails}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <Copy size={13} />
                  Copy emails
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Good candidates for a follow-up email — especially if you add a discount code after they dropped off.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {abandonedTxns.map((t, i) => {
                  const ticketName = ticketTypes.find((tt) => tt.id === t.ticketTypeId)?.name ?? "Ticket";
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm py-1.5 border-t border-slate-100 first:border-t-0 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-slate-800 truncate">{t.email}</p>
                        <p className="text-xs text-slate-400">
                          {ticketName} · {formatNaira(t.amountNaira)}
                          {t.discountCodeId && " · tried a discount code"}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{timeAgo(t.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {neverSubmitted.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
              <FileEdit size={14} className="text-amber-500" />
              Started the form, never submitted ({neverSubmitted.length})
            </p>
            <button
              onClick={copyFormStartEmails}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Copy size={13} />
              Copy emails
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            They typed an email into this event&apos;s registration form but never hit submit — didn&apos;t even reach checkout.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {neverSubmitted.map((f, i) => {
              const ticketName = f.ticketTypeId ? ticketTypes.find((tt) => tt.id === f.ticketTypeId)?.name : null;
              return (
                <div key={i} className="flex items-center justify-between gap-3 text-sm py-1.5 border-t border-slate-100 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-slate-800 truncate">{f.email}</p>
                    {(f.fullName || ticketName) && (
                      <p className="text-xs text-slate-400">
                        {f.fullName}
                        {f.fullName && ticketName && " · "}
                        {ticketName && `was looking at ${ticketName}`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(f.updatedAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-slate-800">
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
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
          <Ticket size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No ticket types yet</p>
          <p className="text-xs text-slate-400 mt-1.5">
            Without one, registration is free and unlimited — add a ticket type to cap capacity or charge for attendance.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ticketTypes.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-brand-600/30 hover:shadow-sm transition-all">
              <div className="w-10 h-10 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 shrink-0">
                <DollarSign size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{t.name}</p>
                <p className="text-sm text-slate-500">
                  {t.priceNaira > 0 ? formatNaira(t.priceNaira) : "Free"} · {t.quantitySold} sold
                  {t.quantityAvailable != null && ` of ${t.quantityAvailable}`}
                </p>
              </div>
              <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => {
                    setForm({
                      id: t.id,
                      name: t.name,
                      description: t.description || "",
                      priceNaira: String(t.priceNaira),
                      quantityAvailable: t.quantityAvailable != null ? String(t.quantityAvailable) : "",
                    });
                    setFormError("");
                    setShowForm(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-brand-600 rounded-md hover:bg-slate-100"
                >
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleDelete(t.id, t.name)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-10 mb-4">
        <h2 className="font-semibold text-slate-800">Discount codes ({discountCodes.length})</h2>
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
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
          <Tag size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No discount codes yet</p>
          <p className="text-xs text-slate-400 mt-1.5">A code applies to every paid ticket type on this event — great for early-bird or group pricing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {discountCodes.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-brand-600/30 hover:shadow-sm transition-all">
              <div className="w-10 h-10 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 shrink-0">
                {d.discountType === "percentage" ? <Percent size={16} /> : <DollarSign size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono font-medium text-slate-900">{d.code}</p>
                <p className="text-sm text-slate-500">
                  {d.discountType === "percentage" ? `${d.discountValue}% off` : `${formatNaira(d.discountValue)} off`}
                  {d.maxDiscountNaira != null && ` (up to ${formatNaira(d.maxDiscountNaira)})`} · {d.usesCount} used
                  {d.maxUses != null && ` of ${d.maxUses}`}
                  {d.perCustomerLimit === "single" && " · once per customer"}
                  {(discountGivenByCode.get(d.id) ?? 0) > 0 && ` · ${formatNaira(discountGivenByCode.get(d.id) ?? 0)} given`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {d.ticketTypeIds && d.ticketTypeIds.length > 0
                    ? `${d.ticketTypeIds.length} ticket type${d.ticketTypeIds.length !== 1 ? "s" : ""}`
                    : "All ticket types"}
                  {d.minSpendNaira != null && ` · min. ${formatNaira(d.minSpendNaira)} ticket`}
                  {d.startsAt && ` · from ${new Date(d.startsAt).toLocaleDateString()}`}
                  {d.endsAt && ` · until ${new Date(d.endsAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleViewUsage(d)}
                  disabled={d.usesCount === 0}
                  title={d.usesCount === 0 ? "No redemptions yet" : "View who used this code"}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Users size={14} />
                  Usage
                </button>
                <button
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
                  className="p-1.5 text-slate-400 hover:text-brand-600 rounded-md hover:bg-slate-100"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteCode(d.id, d.code)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCodeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{codeForm.id ? "Edit Discount Code" : "Add Discount Code"}</h2>
              <button onClick={() => setShowCodeForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCodeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Code</label>
                <input
                  required
                  value={codeForm.code}
                  onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                  placeholder="e.g. EARLYBIRD"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Discount type</label>
                  <select
                    value={codeForm.discountType}
                    onChange={(e) => setCodeForm({ ...codeForm, discountType: e.target.value as DiscountCode["discountType"] })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                  >
                    <option value="percentage">Percentage off</option>
                    <option value="fixed">Fixed amount off</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Applies to</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="radio"
                      checked={codeForm.scope === "all"}
                      onChange={() => setCodeForm({ ...codeForm, scope: "all", ticketTypeIds: [] })}
                      className="text-brand-600 focus:ring-brand-600"
                    />
                    All ticket types
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="radio"
                      checked={codeForm.scope === "specific"}
                      onChange={() => setCodeForm({ ...codeForm, scope: "specific" })}
                      className="text-brand-600 focus:ring-brand-600"
                    />
                    Specific ticket types
                  </label>
                </div>
                {codeForm.scope === "specific" && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50">
                    {ticketTypes.length === 0 ? (
                      <p className="text-xs text-slate-400">No ticket types on this event yet.</p>
                    ) : (
                      ticketTypes.map((t) => {
                        const checked = codeForm.ticketTypeIds.includes(t.id);
                        return (
                          <label
                            key={t.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                              checked ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-200"
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Per-customer limit</label>
                <select
                  value={codeForm.perCustomerLimit}
                  onChange={(e) => setCodeForm({ ...codeForm, perCustomerLimit: e.target.value as DiscountCode["perCustomerLimit"] })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                >
                  <option value="unlimited">Multiple uses per customer</option>
                  <option value="single">Once per customer</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Max total uses <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={codeForm.maxUses}
                    onChange={(e) => setCodeForm({ ...codeForm, maxUses: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Max discount <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={codeForm.maxDiscountNaira}
                    onChange={(e) => setCodeForm({ ...codeForm, maxDiscountNaira: e.target.value })}
                    placeholder="No cap"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Minimum ticket price to qualify <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={codeForm.minSpendNaira}
                  onChange={(e) => setCodeForm({ ...codeForm, minSpendNaira: e.target.value })}
                  placeholder="No minimum"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Starts <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={codeForm.startsAt}
                    onChange={(e) => setCodeForm({ ...codeForm, startsAt: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Ends <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={codeForm.endsAt}
                    onChange={(e) => setCodeForm({ ...codeForm, endsAt: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              {codeFormError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {codeFormError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCodeForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
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
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{form.id ? "Edit Ticket Type" : "Add Ticket Type"}</h2>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. General Admission"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Price (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.priceNaira}
                    onChange={(e) => setForm({ ...form, priceNaira: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Quantity <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.quantityAvailable}
                    onChange={(e) => setForm({ ...form, quantityAvailable: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
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
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Usage — <span className="font-mono">{usageCode.code}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {usageCode.usesCount} redemption{usageCode.usesCount !== 1 ? "s" : ""}
                  {usageCode.maxUses != null && ` of ${usageCode.maxUses}`}
                </p>
              </div>
              <button onClick={() => setUsageCode(null)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              {loadingRedemptions ? (
                <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
              ) : redemptions.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No redemptions yet.</p>
              ) : (
                <div className="space-y-3">
                  {redemptions.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{r.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{r.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900">{formatNaira(r.amountPaidNaira)}</p>
                        <p className="text-xs text-slate-400">{new Date(r.purchasedAt).toLocaleDateString()}</p>
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
