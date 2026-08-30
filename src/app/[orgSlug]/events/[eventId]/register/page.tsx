"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import { AlertCircle, Calendar, Check, Copy, ExternalLink, Loader2, MapPin, MapPinCheckInside, Tag, Ticket, Video, X } from "lucide-react";
import { EventRecord, TicketType } from "@/lib/types";
import { DynamicRegistrationForm, type DynamicRegistrationFormValues } from "@/components/dynamic-registration-form";
import { formatDate, formatTime, safeHttpUrl } from "@/lib/utils";
import { applyDiscount, formatNaira } from "@/lib/billing";

type PublicEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };
type PublicTicketType = Pick<TicketType, "id" | "name" | "description" | "priceNaira" | "quantityAvailable" | "quantitySold" | "salesStart" | "salesEnd">;

type Confirmation = {
  /** Unset for virtual events — no physical check-in, so no reference ID/QR is issued;
   *  the registration is captured straight as a lead instead. */
  referenceId?: string;
  emailSent: boolean;
  /** Undefined only if Hub provisioning failed server-side (best-effort, never
   *  blocks registration itself) — the button is simply omitted in that case. */
  hubUrl?: string;
  event: {
    name: string;
    date: string;
    eventFormat: "physical" | "virtual";
    virtualJoinUrl?: string;
    virtualPlatform?: string;
    virtualAccessNotes?: string;
    venue?: string;
    location?: string;
  };
};

function isTicketAvailable(t: PublicTicketType) {
  const now = new Date();
  if (t.salesStart && new Date(t.salesStart) > now) return false;
  if (t.salesEnd && new Date(t.salesEnd) < now) return false;
  if (t.quantityAvailable != null && t.quantitySold >= t.quantityAvailable) return false;
  return true;
}

export default function RegisterPage() {
  const params = useParams<{ orgSlug: string; eventId: string }>();
  const { orgSlug, eventId } = params;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [event, setEvent] = useState<PublicEvent | null>(null);

  const [ticketTypes, setTicketTypes] = useState<PublicTicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; discountType: "percentage" | "fixed"; discountValue: number; maxDiscountNaira: number | null } | null>(
    null
  );
  const [discountError, setDiscountError] = useState("");
  const [validatingDiscount, setValidatingDiscount] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events`).then((res) => res.json()),
      fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/tickets`).then((res) => res.json()),
    ])
      .then(([eventsData, ticketsData]) => {
        if (eventsData.error) {
          setLoadError(eventsData.error);
          return;
        }
        const found = (eventsData.events as PublicEvent[]).find((e) => e.id === eventId);
        if (!found) {
          setLoadError("This event couldn't be found — it may have ended or the link may be incorrect.");
          return;
        }
        setEvent(found);
        const tickets = (ticketsData.ticketTypes as PublicTicketType[]) || [];
        setTicketTypes(tickets);
        if (tickets.length === 1) setSelectedTicketId(tickets[0].id);
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug, eventId]);

  useEffect(() => {
    if (!confirmation?.referenceId) return;
    QRCode.toDataURL(confirmation.referenceId, { width: 220, margin: 1, color: { dark: "#1e1b2e", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [confirmation]);

  // Paystack redirects the browser back here after a paid-ticket checkout with
  // ?payment=callback — verify immediately rather than waiting on the webhook.
  useEffect(() => {
    if (!event || searchParams.get("payment") !== "callback") return;
    const reference = searchParams.get("reference");
    if (!reference) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifyingPayment(true);
    fetch(`/api/paystack/ticket-purchase/verify?reference=${encodeURIComponent(reference)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setConfirmation({
            referenceId: json.referenceId ?? undefined,
            emailSent: true,
            hubUrl: json.hubUrl ?? undefined,
            event: {
              name: event.name,
              date: event.date,
              eventFormat: event.eventFormat ?? "physical",
              virtualJoinUrl: event.virtualJoinUrl,
              virtualPlatform: event.virtualPlatform,
              virtualAccessNotes: event.virtualAccessNotes,
              venue: event.venue,
              location: event.location,
            },
          });
        } else {
          setSubmitError(json.error || "Couldn't verify this payment. Please try again.");
        }
      })
      .catch(() => {
        if (!cancelled) setSubmitError("Couldn't reach the server to verify payment. Please try again.");
      })
      .finally(() => {
        if (cancelled) return;
        setVerifyingPayment(false);
        // Stripping the query params changes `searchParams`'s identity, which reruns
        // this effect's cleanup (cancelled = true) on the next render — done only now,
        // after the result is already applied, so that cleanup can never race ahead of
        // and discard a real success/failure that arrived while this was in flight.
        router.replace(`/${orgSlug}/events/${eventId}/register`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, searchParams]);

  async function handleApplyDiscount() {
    const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
    if (!discountCodeInput.trim() || !selectedTicket) return;
    setDiscountError("");
    setValidatingDiscount(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/discount-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discountCodeInput.trim(), ticketTypeId: selectedTicket.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.valid) {
        setDiscountError(json.error || "This code isn't valid.");
        return;
      }
      setAppliedDiscount({ code: discountCodeInput.trim().toUpperCase(), discountType: json.discountType, discountValue: json.discountValue, maxDiscountNaira: json.maxDiscountNaira });
    } catch {
      setDiscountError("Couldn't check that code. Please try again.");
    } finally {
      setValidatingDiscount(false);
    }
  }

  function handleRemoveDiscount() {
    setAppliedDiscount(null);
    setDiscountCodeInput("");
    setDiscountError("");
  }

  async function handleSubmit(values: DynamicRegistrationFormValues) {
    const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
    setSubmitError("");
    setSubmitting(true);
    try {
      if (selectedTicket && selectedTicket.priceNaira > 0) {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/ticket-purchase/initialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, ticketTypeId: selectedTicket.id, discountCode: appliedDiscount?.code, ...values }),
        });
        const json = await res.json();
        if (!res.ok || !json.authorizationUrl) {
          setSubmitError(json.error || "Couldn't start payment. Please try again.");
          return;
        }
        window.location.assign(json.authorizationUrl);
        return;
      }

      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, ticketTypeId: selectedTicket?.id, ...values }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Couldn't complete your registration. Please try again.");
        return;
      }
      setConfirmation({ referenceId: json.referenceId, emailSent: !!json.emailSent, hubUrl: json.hubUrl ?? undefined, event: json.event });
    } catch {
      setSubmitError("Couldn't complete your registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyReferenceId() {
    if (!confirmation?.referenceId) return;
    await navigator.clipboard.writeText(confirmation.referenceId);
    setCopied(true);
    toast.success("Reference ID copied");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <MapPinCheckInside size={26} className="text-[#C21FAF]/40 animate-pulse" />
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500 max-w-sm">
          <p className="font-medium text-slate-700">{loadError || "This event couldn't be found."}</p>
          <p className="text-sm mt-1">Check the link you were given and try again.</p>
        </div>
      </div>
    );
  }

  if (verifyingPayment && !confirmation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500">
          <Loader2 size={26} className="animate-spin text-[#C21FAF] mx-auto mb-3" />
          <p className="font-medium text-slate-700">Verifying your payment…</p>
        </div>
      </div>
    );
  }

  if (event.eventFormat !== "virtual" && event.selfRegistrationEnabled === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500 max-w-sm">
          <p className="font-medium text-slate-700">Registration isn&apos;t available for {event.name}.</p>
          <p className="text-sm mt-1">This event captures attendees directly at the door — no sign-up needed ahead of time.</p>
        </div>
      </div>
    );
  }

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
  const discountedPrice =
    selectedTicket && appliedDiscount ? applyDiscount(selectedTicket.priceNaira, appliedDiscount.discountType, appliedDiscount.discountValue, appliedDiscount.maxDiscountNaira) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="pt-12 pb-8 px-4" style={{ background: "#C21FAF" }}>
        <div className="max-w-xl mx-auto text-white">
          <p className="text-xs uppercase tracking-wider text-white/60 mb-2">Event registration</p>
          <h1 className="font-display text-2xl mb-3">{event.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {formatDate(event.date)}
              {event.startTime && ` · ${formatTime(event.startTime)}`}
              {event.endTime && ` - ${formatTime(event.endTime)}`}
            </span>
            {event.eventFormat === "virtual" ? (
              <span className="flex items-center gap-1.5">
                <Video size={14} />
                {event.virtualPlatform || "Online"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {event.venue}, {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative max-w-xl mx-auto px-4 -mt-4">
        {confirmation ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto mb-4">
              <Check size={22} />
            </div>
            <h2 className="font-semibold text-lg text-slate-900 mb-1">You&apos;re registered!</h2>
            <p className="text-sm text-slate-500 mb-6">
              {confirmation.event.eventFormat === "virtual"
                ? confirmation.emailSent
                  ? "We've also emailed you the joining details. No check-in needed — just join at the time above."
                  : "No check-in needed for this one — just join at the time above."
                : confirmation.emailSent
                  ? "We've also emailed you this confirmation. Keep it — you'll need it to check in."
                  : "Keep this reference ID — you'll need it to check in."}
            </p>

            {confirmation.referenceId && (
              <>
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Registration QR code" className="mx-auto mb-4 rounded-lg border border-slate-200" width={180} height={180} />
                )}

                <button
                  type="button"
                  onClick={copyReferenceId}
                  className="inline-flex items-center gap-2 mx-auto px-4 py-2 rounded-lg border border-slate-200 font-mono text-base font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {confirmation.referenceId}
                  {copied ? <Check size={15} className="text-teal-600" /> : <Copy size={15} className="text-slate-400" />}
                </button>
              </>
            )}

            {confirmation.hubUrl && (
              <a
                href={confirmation.hubUrl}
                className="mt-4 inline-flex items-center gap-2 mx-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90"
                style={{ background: "#C21FAF" }}
              >
                <ExternalLink size={14} />
                Open event hub
              </a>
            )}

            {confirmation.event.eventFormat === "virtual" ? (
              <div className="mt-6 pt-5 border-t border-slate-100 text-left">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Joining details</h3>
                {safeHttpUrl(confirmation.event.virtualJoinUrl) && (
                  <a href={safeHttpUrl(confirmation.event.virtualJoinUrl)} target="_blank" rel="noreferrer" className="block text-sm text-[#C21FAF] hover:underline break-all">
                    {confirmation.event.virtualJoinUrl}
                  </a>
                )}
                {confirmation.event.virtualAccessNotes && <p className="text-sm text-slate-500 mt-2 whitespace-pre-line">{confirmation.event.virtualAccessNotes}</p>}
              </div>
            ) : (
              <div className="mt-6 pt-5 border-t border-slate-100 text-left">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">At the event</h3>
                <p className="text-sm text-slate-500">
                  Show this QR code (or your reference ID) at check-in — {confirmation.event.venue}, {confirmation.event.location}.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            {event.description && <p className="text-sm text-slate-600 mb-5">{event.description}</p>}

            {ticketTypes.length === 1 && ticketTypes[0].priceNaira > 0 && (
              <div className="flex items-center justify-between gap-3 p-3.5 mb-5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-sm text-slate-700 flex items-center gap-2">
                  <Ticket size={14} className="text-[#C21FAF]" />
                  {ticketTypes[0].name}
                </p>
                {discountedPrice != null ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 line-through">{formatNaira(ticketTypes[0].priceNaira)}</span>
                    <span className="font-semibold text-emerald-700">{formatNaira(discountedPrice)}</span>
                  </span>
                ) : (
                  <span className="font-semibold text-slate-900">{formatNaira(ticketTypes[0].priceNaira)}</span>
                )}
              </div>
            )}

            {ticketTypes.length > 1 && (
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-slate-800 mb-2">Choose a ticket</h2>
                <div className="space-y-2">
                  {ticketTypes.map((t) => {
                    const available = isTicketAvailable(t);
                    const selected = selectedTicketId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!available}
                        onClick={() => {
                          setSelectedTicketId(t.id);
                          handleRemoveDiscount();
                        }}
                        className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          selected ? "border-[#C21FAF] bg-[#C21FAF]/5" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 flex items-center gap-2">
                            <Ticket size={14} className={selected ? "text-[#C21FAF]" : "text-slate-400"} />
                            {t.name}
                          </p>
                          {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                          {!available && <p className="text-xs text-rose-500 mt-0.5">Sold out or unavailable</p>}
                        </div>
                        <span className="font-semibold text-slate-900 shrink-0">{t.priceNaira > 0 ? formatNaira(t.priceNaira) : "Free"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTicket && selectedTicket.priceNaira > 0 && (
              <div className="mb-5">
                {appliedDiscount ? (
                  <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <Tag size={14} />
                        <span className="font-mono font-semibold">{appliedDiscount.code}</span> applied
                      </span>
                      <button type="button" onClick={handleRemoveDiscount} className="text-emerald-700 hover:text-emerald-900">
                        <X size={15} />
                      </button>
                    </div>
                    {discountedPrice != null && (
                      <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-emerald-100">
                        <span className="text-xs">You saved {formatNaira(selectedTicket.priceNaira - discountedPrice)}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-emerald-600 line-through">{formatNaira(selectedTicket.priceNaira)}</span>
                          <span className="font-semibold">{formatNaira(discountedPrice)} to pay</span>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={discountCodeInput}
                        onChange={(e) => setDiscountCodeInput(e.target.value)}
                        placeholder="Discount code"
                        className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                      />
                      <button
                        type="button"
                        onClick={handleApplyDiscount}
                        disabled={validatingDiscount || !discountCodeInput.trim()}
                        className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {validatingDiscount ? "Checking…" : "Apply"}
                      </button>
                    </div>
                    {discountError && <p className="text-xs text-rose-600 mt-1.5">{discountError}</p>}
                  </>
                )}
              </div>
            )}

            {submitError && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}

            {ticketTypes.length > 1 && !selectedTicketId ? (
              <p className="text-sm text-slate-400 text-center py-4">Select a ticket above to continue.</p>
            ) : ticketTypes.length === 1 && !isTicketAvailable(ticketTypes[0]) ? (
              <p className="text-sm text-slate-400 text-center py-4">This event&apos;s ticket is sold out or unavailable.</p>
            ) : (
              <DynamicRegistrationForm fields={event.customFields || []} onSubmit={handleSubmit} submitting={submitting} submitError="" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
