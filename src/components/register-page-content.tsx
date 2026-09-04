"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  MapPinCheckInside,
  Radio,
  Share2,
  Tag,
  Ticket,
  Video,
  X,
} from "lucide-react";
import { EventRecord, TicketType } from "@/lib/types";
import { Logo } from "@/components/logo";
import { DynamicRegistrationForm, type DynamicRegistrationFormValues } from "@/components/dynamic-registration-form";
import { OneOnOneRequestStep } from "@/components/one-on-one-request-step";
import { EventHostCard } from "@/components/event-host-card";
import { formatDate, formatTime, safeHttpUrl } from "@/lib/utils";
import { applyDiscount, formatNaira } from "@/lib/billing";
import { getEventStatus, zonedTimeToUtc } from "@/lib/capture-window";

/** Same sticky public header as /discover — a shared visual identity across every
 *  public-facing page, and a visitor's only way back to the rest of the site from a
 *  link an organizer shared directly. */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <span className="sm:hidden">
          <Logo height={18} />
        </span>
        <span className="hidden sm:block">
          <Logo height={26} />
        </span>
        <nav className="flex items-center gap-3 sm:gap-6">
          <Link href="/discover" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
            Events
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
            Pricing
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
          <Link href="/signup" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors">
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}

type PublicEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };
type PublicTicketType = Pick<TicketType, "id" | "name" | "description" | "priceNaira" | "quantityAvailable" | "quantitySold" | "salesStart" | "salesEnd">;

type Confirmation = {
  /** Unset for virtual events — no physical check-in, so no reference ID/QR is issued;
   *  the registration is captured straight as a lead instead. */
  referenceId?: string;
  emailSent: boolean;
  /** Defaults to "registered" (paid tickets and events without approval/waitlist
   *  turned on always land there) — pending/waitlisted only ever come back from the
   *  free-registration route when the organizer has one of those features on. */
  status?: "registered" | "pending" | "waitlisted";
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

function formatFullDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function toGCalStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A real, working "Add to calendar" action — not a placeholder button — built from
 *  the event's own scheduled window (respecting its timezone, same conversion the
 *  registration gate itself uses) rather than a naive browser-local guess. */
function buildGoogleCalendarUrl(event: PublicEvent) {
  const start = zonedTimeToUtc(event.date, event.startTime || "09:00", event.timezone);
  const end = zonedTimeToUtc(event.endDate || event.date, event.endTime || event.startTime || "10:00", event.timezone);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${toGCalStamp(start)}/${toGCalStamp(end)}`,
    details: event.description || "",
    location: event.eventFormat === "virtual" ? event.virtualPlatform || "Online" : `${event.venue}, ${event.location}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const STATUS_LABEL: Record<string, string> = { upcoming: "Upcoming", active: "Happening now", completed: "Completed" };

// A paid ticket redirects the browser away to Paystack and back — sessionStorage
// survives that round-trip (component state doesn't), so the 1-on-1 step still
// knows who just registered once the payment-callback effect restores it below.
const PENDING_IDENTITY_KEY = "eventbuddy:pendingAttendeeIdentity";

/**
 * The actual public registration experience — hero, quick facts, info cards, and the
 * sticky ticket/registration/1-on-1-booking panel. Mounted from two different routes
 * that resolve `eventIdOrSlug` differently before rendering this:
 *  - /[orgSlug]/events/[eventId]/register — the original org-scoped form (id or an
 *    org-scoped slug), kept working for any link shared before /discover/[slug]
 *    existed or for an event with no global slug set.
 *  - /discover/[slug] — the newer universal public link format, which resolves the
 *    owning org first (see /api/events/by-slug) then renders this unchanged.
 * Both pass the exact param the visitor's URL contains; the fetch below matches it
 * against the org's events by either id or slug, same as it always has.
 */
export function RegisterPageContent({ orgSlug, eventIdOrSlug }: { orgSlug: string; eventIdOrSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
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

  const [attendeeIdentity, setAttendeeIdentity] = useState<{ fullName: string; email: string; phone?: string } | null>(null);
  const [oneOnOneEnabled, setOneOnOneEnabled] = useState(false);
  const [oneOnOneDismissed, setOneOnOneDismissed] = useState(false);
  const [oneOnOneRequested, setOneOnOneRequested] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [attendeeSummary, setAttendeeSummary] = useState<{ totalCount: number; sampleNames: string[] } | null>(null);

  // eventIdOrSlug may be the event's real id, an org-scoped slug, or a global slug
  // (see migration 0057) — all are matched here against the org's full event list,
  // and every API call after this point uses the resolved `found.id` (the real
  // uuid), never the raw param, since none of those routes understand slugs.
  useEffect(() => {
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events`)
      .then((res) => res.json())
      .then(async (eventsData) => {
        if (eventsData.error) {
          setLoadError(eventsData.error);
          return;
        }
        const found = (eventsData.events as PublicEvent[]).find((e) => e.id === eventIdOrSlug || (e.slug && e.slug === eventIdOrSlug));
        if (!found) {
          setLoadError("This event couldn't be found — it may have ended or the link may be incorrect.");
          return;
        }
        setEvent(found);
        setOrgName(eventsData.organization?.name ?? "");
        const ticketsData = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${found.id}/tickets`).then((res) => res.json());
        const tickets = (ticketsData.ticketTypes as PublicTicketType[]) || [];
        setTicketTypes(tickets);
        if (tickets.length === 1) setSelectedTicketId(tickets[0].id);
        fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${found.id}/register/view`, { method: "POST" }).catch(() => {});
        fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${found.id}/attendee-summary`)
          .then((res) => res.json())
          .then((json) => setAttendeeSummary({ totalCount: json.totalCount ?? 0, sampleNames: json.sampleNames ?? [] }))
          .catch(() => {});
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug, eventIdOrSlug]);

  useEffect(() => {
    if (!confirmation?.referenceId) return;
    QRCode.toDataURL(confirmation.referenceId, { width: 220, margin: 1, color: { dark: "#1e1b2e", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [confirmation]);

  // Checks for a "Book a 1-on-1" step the instant registration succeeds — the route
  // itself reports enabled:false when the organizer hasn't turned this on, so this
  // silently does nothing for every ordinary event.
  useEffect(() => {
    if (!confirmation || !event) return;
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${event.id}/one-on-one`)
      .then((res) => res.json())
      .then((json) => setOneOnOneEnabled(!!json.enabled))
      .catch(() => setOneOnOneEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const storedIdentity = sessionStorage.getItem(PENDING_IDENTITY_KEY);
          if (storedIdentity) {
            try {
              setAttendeeIdentity(JSON.parse(storedIdentity));
            } catch {
              // Malformed/stale value — the 1-on-1 step just won't have a name/email
              // prefilled, no worse than if this round-trip storage didn't exist.
            }
            sessionStorage.removeItem(PENDING_IDENTITY_KEY);
          }
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
        // Using the current pathname (not a hand-built URL) means this stays correct
        // regardless of which route mounted this component.
        router.replace(pathname);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, searchParams]);

  async function handleApplyDiscount() {
    const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
    if (!discountCodeInput.trim() || !selectedTicket || !event) return;
    setDiscountError("");
    setValidatingDiscount(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${event.id}/discount-code`, {
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

  /** Fire-and-forget — lets the event's dashboard see who started the form
   *  without ever submitting it. Never awaited, and a failure here must never
   *  surface to the visitor or affect the actual registration flow. */
  function handleFormProgress(values: { firstName: string; lastName: string; email: string }) {
    if (!event) return;
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${event.id}/registration-form-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, ticketTypeId: selectedTicketId ?? undefined }),
    }).catch(() => {});
  }

  async function handleSubmit(values: DynamicRegistrationFormValues) {
    if (!event) return;
    const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
    const identity = { fullName: `${values.firstName.trim()} ${values.lastName.trim()}`.trim(), email: values.email.trim(), phone: values.phone.trim() || undefined };
    setSubmitError("");
    setSubmitting(true);
    try {
      if (selectedTicket && selectedTicket.priceNaira > 0) {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/ticket-purchase/initialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: event.id, ticketTypeId: selectedTicket.id, discountCode: appliedDiscount?.code, ...values }),
        });
        const json = await res.json();
        if (!res.ok || !json.authorizationUrl) {
          setSubmitError(json.error || "Couldn't start payment. Please try again.");
          return;
        }
        sessionStorage.setItem(PENDING_IDENTITY_KEY, JSON.stringify(identity));
        window.location.assign(json.authorizationUrl);
        return;
      }

      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, ticketTypeId: selectedTicket?.id, ...values }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Couldn't complete your registration. Please try again.");
        return;
      }
      setAttendeeIdentity(identity);
      setConfirmation({ referenceId: json.referenceId, emailSent: !!json.emailSent, status: json.status ?? "registered", hubUrl: json.hubUrl ?? undefined, event: json.event });
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

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: event?.name, url });
      } catch {
        // User dismissed the native share sheet — not an error.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#22103A]">
        <PublicHeader />
        <div className="flex items-center justify-center py-32">
          <MapPinCheckInside size={26} className="text-[#FF8AF5]/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="min-h-screen bg-[#22103A]">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="text-center text-white/60 max-w-sm">
            <p className="font-medium text-white">{loadError || "This event couldn't be found."}</p>
            <p className="text-sm mt-1">Check the link you were given and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  if (verifyingPayment && !confirmation) {
    return (
      <div className="min-h-screen bg-[#22103A]">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="text-center text-white/60">
            <Loader2 size={26} className="animate-spin text-[#FF8AF5] mx-auto mb-3" />
            <p className="font-medium text-white">Verifying your payment…</p>
          </div>
        </div>
      </div>
    );
  }

  if (event.eventFormat !== "virtual" && event.selfRegistrationEnabled === false) {
    return (
      <div className="min-h-screen bg-[#22103A]">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="text-center text-white/60 max-w-sm">
            <p className="font-medium text-white">Registration isn&apos;t available for {event.name}.</p>
            <p className="text-sm mt-1">This event captures attendees directly at the door — no sign-up needed ahead of time.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
  const discountedPrice =
    selectedTicket && appliedDiscount ? applyDiscount(selectedTicket.priceNaira, appliedDiscount.discountType, appliedDiscount.discountValue, appliedDiscount.maxDiscountNaira) : null;

  const minPriceNaira = ticketTypes.length > 0 ? Math.min(...ticketTypes.map((t) => t.priceNaira)) : 0;
  const isFreeEvent = ticketTypes.length === 0 || minPriceNaira === 0;
  const priceLabel = isFreeEvent ? "Free" : ticketTypes.length > 1 ? `From ${formatNaira(minPriceNaira)}` : formatNaira(minPriceNaira);
  const status = getEventStatus({ date: event.date, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime, timezone: event.timezone });

  const badges = [STATUS_LABEL[status], event.eventFormat === "virtual" ? "Virtual" : "In Person", event.category].filter(Boolean) as string[];

  const showOneOnOneStep =
    !!confirmation && confirmation.status !== "pending" && confirmation.status !== "waitlisted" && oneOnOneEnabled && !oneOnOneDismissed;

  return (
    <div className="min-h-screen bg-[#22103A]">
      {/* Ambient glow behind the glass cards — fixed + its own overflow-hidden so it
          never affects the sticky registration panel's containing block. Purely
          atmospheric: slow, low-opacity, never the thing a visitor consciously notices. */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-[#C21FAF]/25 blur-[110px] animate-aurora-a" />
        <div className="absolute top-1/3 -right-32 w-[560px] h-[560px] rounded-full bg-[#6D28D9]/25 blur-[120px] animate-aurora-b" />
      </div>

      <div className="relative z-10">
      <PublicHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14">
        {/* Hero — cover image + title/badges/CTA, matching the composition of a real
            event landing page rather than the plain header band this used to be. */}
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-8 items-start animate-fade-in-up">
          <div className="aspect-video rounded-2xl overflow-hidden bg-slate-100 shadow-sm">
            {event.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.coverImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center px-8"
                style={{ background: "radial-gradient(ellipse 150% 130% at 80% -10%, #FF8AF5 0%, #C21FAF 60%, #170821 140%)" }}
              >
                <span className="font-display text-2xl sm:text-3xl text-white/90 text-center">{event.name}</span>
              </div>
            )}
          </div>

          <div>
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {badges.map((b) => (
                  <span key={b} className="text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-[#FFF3FD] text-[#93147D]">
                    {b}
                  </span>
                ))}
              </div>
            )}
            <h1 className="font-display text-3xl sm:text-4xl text-white mb-4" style={{ textWrap: "balance" }}>
              {event.name}
            </h1>
            <div className="space-y-2 text-white/70 text-sm mb-6">
              <p className="flex items-center gap-2">
                <Calendar size={15} className="text-white/40 shrink-0" />
                {formatFullDate(event.date)}
                {event.startTime && ` · ${formatTime(event.startTime)}`}
                {event.endTime && ` – ${formatTime(event.endTime)}`}
              </p>
              <p className="flex items-center gap-2">
                {event.eventFormat === "virtual" ? (
                  <>
                    <Video size={15} className="text-white/40 shrink-0" />
                    {event.virtualPlatform || "Online"}
                  </>
                ) : (
                  <>
                    <MapPin size={15} className="text-white/40 shrink-0" />
                    {event.venue}, {event.location}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="#register-panel"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: "#C21FAF" }}
              >
                <Ticket size={16} />
                {isFreeEvent ? "Register free" : `Register · ${priceLabel}`}
              </a>
              <a
                href={buildGoogleCalendarUrl(event)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
              >
                <CalendarPlus size={16} />
                Add to calendar
              </a>
            </div>
          </div>
        </div>

        {/* Quick facts */}
        <div className="grid grid-cols-3 mt-8 border-y border-white/10 py-5">
          {[
            { label: "Price", value: priceLabel },
            { label: event.eventFormat === "virtual" ? "Platform" : "City", value: event.eventFormat === "virtual" ? event.virtualPlatform || "Online" : event.location },
            { label: "Format", value: event.eventFormat === "virtual" ? "Virtual" : "In Person" },
          ].map((fact, i) => (
            <div key={fact.label} className={`px-2 ${i > 0 ? "border-l border-white/10" : ""}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">{fact.label}</p>
              <p className="text-sm font-semibold text-white truncate">{fact.value}</p>
            </div>
          ))}
        </div>

        {/* Body: details on the left, registration panel on the right */}
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 mt-10 items-start">
          <div className="space-y-5 min-w-0">
            {event.description && (
              <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "0ms" }}>
                <h2 className="font-semibold text-white mb-2">About this event</h2>
                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}

            <div
              className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up"
              style={{ animationDelay: event.description ? "60ms" : "0ms" }}
            >
              <h2 className="font-semibold text-white mb-3">Date and time</h2>
              <p className="flex items-start gap-2.5 text-sm text-white/80">
                <Calendar size={16} className="text-[#FF8AF5] mt-0.5 shrink-0" />
                <span>
                  {formatFullDate(event.date)}
                  {event.startTime && ` · ${formatTime(event.startTime)}`}
                  {event.endTime && ` – ${formatTime(event.endTime)}`}
                  {event.timezone && <span className="block text-white/40 text-xs mt-0.5">{event.timezone.replace(/_/g, " ")}</span>}
                </span>
              </p>
            </div>

            {event.eventFormat === "virtual" ? (
              <div
                className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up"
                style={{ animationDelay: event.description ? "120ms" : "60ms" }}
              >
                <h2 className="font-semibold text-white mb-3">How to join</h2>
                <p className="flex items-start gap-2.5 text-sm text-white/80">
                  <Radio size={16} className="text-[#FF8AF5] mt-0.5 shrink-0" />
                  <span>
                    {event.virtualPlatform || "Online event"}
                    <span className="block text-white/40 text-xs mt-0.5">The join link is sent by email once you register.</span>
                  </span>
                </p>
              </div>
            ) : (
              <div
                className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up"
                style={{ animationDelay: event.description ? "120ms" : "60ms" }}
              >
                <h2 className="font-semibold text-white mb-3">Location</h2>
                <p className="flex items-start gap-2.5 text-sm text-white/80 mb-3">
                  <MapPin size={16} className="text-[#FF8AF5] mt-0.5 shrink-0" />
                  <span>
                    {event.venue}
                    <span className="block text-white/50">{event.location}</span>
                  </span>
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue}, ${event.location}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[#FF8AF5] hover:underline inline-flex items-center gap-1"
                >
                  Open in Google Maps <ExternalLink size={12} />
                </a>
              </div>
            )}

            <div className="animate-fade-in-up" style={{ animationDelay: event.description ? "180ms" : "120ms" }}>
              <EventHostCard orgSlug={orgSlug} eventId={event.id} orgName={orgName} attendeeSummary={attendeeSummary} />
            </div>
          </div>

          {/* Sticky registration panel — this is the real, functional form: ticket
              picker, discount code, dynamic fields, submit. Not a decorative summary
              card standing in for it. */}
          <div id="register-panel" className="lg:sticky lg:top-8 scroll-mt-8 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
            <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl shadow-xl overflow-hidden">
              {showOneOnOneStep && event ? (
                <OneOnOneRequestStep
                  orgSlug={orgSlug}
                  eventId={event.id}
                  defaultFullName={attendeeIdentity?.fullName || ""}
                  defaultEmail={attendeeIdentity?.email || ""}
                  defaultPhone={attendeeIdentity?.phone}
                  onSkip={() => setOneOnOneDismissed(true)}
                  onRequested={() => {
                    setOneOnOneRequested(true);
                    setOneOnOneDismissed(true);
                  }}
                />
              ) : confirmation && (confirmation.status === "pending" || confirmation.status === "waitlisted") ? (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center mx-auto mb-4">
                    <Clock size={22} />
                  </div>
                  <h2 className="font-semibold text-lg text-white mb-1">
                    {confirmation.status === "pending" ? "Registration pending approval" : "You're on the waitlist"}
                  </h2>
                  <p className="text-sm text-white/60">
                    {confirmation.status === "pending"
                      ? "The organizer reviews registrations before confirming them. We'll email you as soon as yours is approved."
                      : "This event is at capacity, but we've added you to the waitlist. We'll email you right away if a spot opens up."}
                  </p>
                </div>
              ) : confirmation ? (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-teal-400/20 text-teal-300 flex items-center justify-center mx-auto mb-4">
                    <Check size={22} />
                  </div>
                  <h2 className="font-semibold text-lg text-white mb-1">You&apos;re registered!</h2>
                  <p className="text-sm text-white/60 mb-6">
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
                        <div className="inline-block p-3 bg-white rounded-lg mb-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrDataUrl} alt="Registration QR code" width={164} height={164} />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={copyReferenceId}
                        className="flex mx-auto items-center gap-2 px-4 py-2 rounded-lg border border-white/20 bg-white/5 font-mono text-base font-semibold text-white hover:bg-white/10"
                      >
                        {confirmation.referenceId}
                        {copied ? <Check size={15} className="text-teal-300" /> : <Copy size={15} className="text-white/40" />}
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
                    <div className="mt-6 pt-5 border-t border-white/10 text-left">
                      <h3 className="text-sm font-semibold text-white mb-2">Joining details</h3>
                      {safeHttpUrl(confirmation.event.virtualJoinUrl) && (
                        <a href={safeHttpUrl(confirmation.event.virtualJoinUrl)} target="_blank" rel="noreferrer" className="block text-sm text-[#FF8AF5] hover:underline break-all">
                          {confirmation.event.virtualJoinUrl}
                        </a>
                      )}
                      {confirmation.event.virtualAccessNotes && <p className="text-sm text-white/60 mt-2 whitespace-pre-line">{confirmation.event.virtualAccessNotes}</p>}
                    </div>
                  ) : (
                    <div className="mt-6 pt-5 border-t border-white/10 text-left">
                      <h3 className="text-sm font-semibold text-white mb-2">At the event</h3>
                      <p className="text-sm text-white/60">
                        Show this QR code (or your reference ID) at check-in — {confirmation.event.venue}, {confirmation.event.location}.
                      </p>
                    </div>
                  )}

                  {oneOnOneRequested && (
                    <div className="mt-6 pt-5 border-t border-white/10 text-left">
                      <h3 className="text-sm font-semibold text-white mb-2">1-on-1 requested</h3>
                      <p className="text-sm text-white/60">The organizer knows you&apos;re interested — they&apos;ll set up a meeting for you at the event.</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="px-6 pt-6 pb-5 border-b border-white/10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">{isFreeEvent ? "Free event" : "Tickets"}</p>
                    <p className="font-display text-3xl text-white">{priceLabel}</p>
                  </div>

                  <div className="p-6">
                    {ticketTypes.length === 1 && ticketTypes[0].priceNaira > 0 && (
                      <div className="flex items-center justify-between gap-3 p-3.5 mb-5 rounded-xl bg-white/5 border border-white/15">
                        <p className="text-sm text-white/80 flex items-center gap-2">
                          <Ticket size={14} className="text-[#FF8AF5]" />
                          {ticketTypes[0].name}
                        </p>
                        {discountedPrice != null ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-white/40 line-through">{formatNaira(ticketTypes[0].priceNaira)}</span>
                            <span className="font-semibold text-emerald-300">{formatNaira(discountedPrice)}</span>
                          </span>
                        ) : (
                          <span className="font-semibold text-white">{formatNaira(ticketTypes[0].priceNaira)}</span>
                        )}
                      </div>
                    )}

                    {ticketTypes.length > 1 && (
                      <div className="mb-5">
                        <h2 className="text-sm font-semibold text-white mb-2">Choose a ticket</h2>
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
                                  selected ? "border-[#FF8AF5] bg-[#FF8AF5]/10" : "border-white/15 hover:border-white/30"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-white flex items-center gap-2">
                                    <Ticket size={14} className={selected ? "text-[#FF8AF5]" : "text-white/40"} />
                                    {t.name}
                                  </p>
                                  {t.description && <p className="text-xs text-white/50 mt-0.5">{t.description}</p>}
                                  {!available && <p className="text-xs text-rose-300 mt-0.5">Sold out or unavailable</p>}
                                </div>
                                <span className="font-semibold text-white shrink-0">{t.priceNaira > 0 ? formatNaira(t.priceNaira) : "Free"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedTicket && selectedTicket.priceNaira > 0 && (
                      <div className="mb-5">
                        {appliedDiscount ? (
                          <div className="p-3 rounded-lg bg-emerald-400/10 text-emerald-200 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2">
                                <Tag size={14} />
                                <span className="font-mono font-semibold">{appliedDiscount.code}</span> applied
                              </span>
                              <button type="button" onClick={handleRemoveDiscount} className="text-emerald-200 hover:text-emerald-100">
                                <X size={15} />
                              </button>
                            </div>
                            {discountedPrice != null && (
                              <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-emerald-400/20">
                                <span className="text-xs">You saved {formatNaira(selectedTicket.priceNaira - discountedPrice)}</span>
                                <span className="flex items-center gap-2">
                                  <span className="text-xs text-emerald-300/70 line-through">{formatNaira(selectedTicket.priceNaira)}</span>
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
                                className="flex-1 px-3.5 py-2.5 rounded-lg border border-white/20 bg-white/5 text-white placeholder:text-white/40 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF8AF5]"
                              />
                              <button
                                type="button"
                                onClick={handleApplyDiscount}
                                disabled={validatingDiscount || !discountCodeInput.trim()}
                                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-white/20 text-white hover:bg-white/10 disabled:opacity-50"
                              >
                                {validatingDiscount ? "Checking…" : "Apply"}
                              </button>
                            </div>
                            {discountError && <p className="text-xs text-rose-300 mt-1.5">{discountError}</p>}
                          </>
                        )}
                      </div>
                    )}

                    {submitError && (
                      <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-400/10 text-rose-200 text-sm">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        {submitError}
                      </div>
                    )}

                    {ticketTypes.length > 1 && !selectedTicketId ? (
                      <p className="text-sm text-white/40 text-center py-4">Select a ticket above to continue.</p>
                    ) : ticketTypes.length === 1 && !isTicketAvailable(ticketTypes[0]) ? (
                      <p className="text-sm text-white/40 text-center py-4">This event&apos;s ticket is sold out or unavailable.</p>
                    ) : (
                      <DynamicRegistrationForm fields={event.customFields || []} onSubmit={handleSubmit} submitting={submitting} submitError="" onProgress={handleFormProgress} />
                    )}
                  </div>

                  <div className="px-6 py-4 border-t border-white/10 space-y-2.5">
                    <p className="flex items-center gap-2.5 text-xs text-white/50">
                      <Calendar size={13} className="text-white/30 shrink-0" />
                      {formatDate(event.date)}
                      {event.startTime && ` · ${formatTime(event.startTime)}`}
                    </p>
                    <p className="flex items-center gap-2.5 text-xs text-white/50 truncate">
                      {event.eventFormat === "virtual" ? (
                        <>
                          <Video size={13} className="text-white/30 shrink-0" />
                          {event.virtualPlatform || "Online"}
                        </>
                      ) : (
                        <>
                          <MapPin size={13} className="text-white/30 shrink-0" />
                          {event.venue}, {event.location}
                        </>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleShare}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white/70 border-t border-white/10 hover:bg-white/5 transition-colors"
                  >
                    <Share2 size={14} />
                    Share this event
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="text-white mt-16" style={{ background: "#170821" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <Logo tone="white" variant="full" height={16} />
            <p className="text-sm text-white/50 mt-4 max-w-xs leading-relaxed">
              Registration, ticketing, and check-in for any event — education fairs, job fairs, conferences, and more.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Product</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/discover" className="text-white/70 hover:text-white">
                Discover Events
              </Link>
              <Link href="/pricing" className="text-white/70 hover:text-white">
                Pricing
              </Link>
              <Link href="/signup" className="text-white/70 hover:text-white">
                Get Started
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Legal</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/privacy" className="text-white/70 hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-white/70 hover:text-white">
                Terms &amp; Conditions
              </Link>
              <Link href="/contact" className="text-white/70 hover:text-white">
                Contact
              </Link>
            </div>
          </div>
        </div>
        <div className="h-1 w-full flex">
          <div className="flex-1" style={{ background: "#C21FAF" }} />
          <div className="flex-1" style={{ background: "#6D28D9" }} />
          <div className="flex-1" style={{ background: "#E85D0A" }} />
          <div className="flex-1" style={{ background: "#B8119C" }} />
        </div>
      </footer>
      </div>
    </div>
  );
}
