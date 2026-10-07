"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/copy-text";
import { ExhibitCta } from "@/components/exhibit-cta";
import { ExhibitorStrip } from "@/components/exhibitor-strip";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { brandedQrDataUrl } from "@/lib/branded-qr";
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  MapPinCheckInside,
  Radio,
  Share2,
  Tag,
  Ticket,
  Video,
  X, Users } from "lucide-react";
import { EventRecord, TicketType } from "@/lib/types";
import { DynamicRegistrationForm, type DynamicRegistrationFormValues } from "@/components/dynamic-registration-form";
import { GroupGuestFields } from "@/components/group-guest-fields";
import { validateGroupGuests, type GroupGuest } from "@/lib/group-tickets";
import { ticketCtaLabel } from "@/lib/ticket-cta";
import { OneOnOneRequestStep } from "@/components/one-on-one-request-step";
import { EventHostCard } from "@/components/event-host-card";
import { RichTextDisplay } from "@/components/rich-text-display";
import { stripHtml } from "@/lib/rich-text";
import { formatDate, formatTime, safeHttpUrl } from "@/lib/utils";
import { applyDiscount, formatNaira } from "@/lib/billing";
import { getEventStatus, zonedTimeToUtc } from "@/lib/capture-window";
import { captureRef, storedRef } from "@/lib/referral-capture";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";

/** Same sticky public header as /discover — a shared visual identity across every
 *  public-facing page, and a visitor's only way back to the rest of the site from a
 *  link an organizer shared directly. */
export function PublicHeader() {
  return <LandingNav />;
}

type PublicEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };
type PublicTicketType = Pick<TicketType, "id" | "name" | "description" | "priceNaira" | "quantityAvailable" | "quantitySold" | "salesStart" | "salesEnd" | "groupSize">;

type Confirmation = {
  /** Group tickets: how many guests were also sent their own ticket. */
  guestCount?: number;
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

// Same tone cycle as the organizer's ticket cards (globals.css .eb-tt).
const TICKET_TONES = ["pink", "violet", "orange", "indigo"] as const;

/** One ticket as a glossy stub: price on the coloured stub, name, group badge
 *  and a low-stock hint on the body. A button in the picker, plain otherwise. */
function TicketStub({ t, tone, selected, available, onSelect }: { t: PublicTicketType; tone: string; selected?: boolean; available: boolean; onSelect?: () => void }) {
  const isGroup = t.groupSize > 1;
  const left = t.quantityAvailable != null ? t.quantityAvailable - t.quantitySold : null;
  const inner = (
    <>
      <span className="eb-tt-stub">
        <span className="eb-tt-stub-icon" aria-hidden="true">
          {isGroup ? <Users size={15} /> : <Ticket size={15} />}
        </span>
        <span>
          <span className="eb-tt-price block">{t.priceNaira > 0 ? formatNaira(t.priceNaira) : "Free"}</span>
          {isGroup && t.priceNaira > 0 && <span className="eb-tt-per block">{formatNaira(Math.round(t.priceNaira / t.groupSize))} each</span>}
        </span>
      </span>
      <span className="eb-tt-perf" aria-hidden="true" />
      <span className="eb-tt-body">
        <span className="eb-tt-name block">{t.name}</span>
        {t.description && <span className="eb-tt-desc block">{t.description}</span>}
        <span className="flex flex-wrap items-center gap-2">
          {isGroup && (
            <span className="eb-tt-chip">
              <Users size={11} aria-hidden="true" /> Admits {t.groupSize}
            </span>
          )}
          {!available ? (
            <span className="eb-tt-hint text-rose-300!">Sold out or unavailable</span>
          ) : left != null && left <= 10 ? (
            <span className="eb-tt-hint">Only {left} left</span>
          ) : null}
        </span>
      </span>
      {onSelect && (
        <span className="eb-tt-check" aria-hidden="true">
          <Check size={13} strokeWidth={3} />
        </span>
      )}
    </>
  );
  if (!onSelect) return <div className="eb-tt eb-tt--pick eb-tt--static" data-tone={tone}>{inner}</div>;
  return (
    <button type="button" className="eb-tt eb-tt--pick" data-tone={tone} aria-pressed={Boolean(selected)} disabled={!available} onClick={onSelect}>
      {inner}
    </button>
  );
}

function formatFullDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function toGCalStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 TEXT escaping — backslash first, so it doesn't double-escape the
 *  backslashes this function itself is about to introduce for the other three. */
function icsEscape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** RFC 5545 requires folding content lines longer than 75 octets — most calendar
 *  apps tolerate long lines anyway, but Outlook in particular is known not to. */
function icsFold(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

/** The .ics file content — Google Calendar's own web UI is already covered by
 *  buildGoogleCalendarUrl above, but this is the only "add to calendar" path that
 *  works for Apple Calendar, Outlook, and every other calendar app that isn't
 *  Google's own web client. Returns raw text rather than a data: URI — Safari
 *  doesn't honor the `download` attribute on a data: href (it just navigates to
 *  it instead), so downloadIcs below wraps this in a real Blob object URL. */
function buildIcsContent(event: PublicEvent, orgSlug: string) {
  const start = zonedTimeToUtc(event.date, event.startTime || "09:00", event.timezone);
  const end = zonedTimeToUtc(event.endDate || event.date, event.endTime || event.startTime || "10:00", event.timezone);
  const location = event.eventFormat === "virtual" ? event.virtualPlatform || "Online" : `${event.venue}, ${event.location}`;
  const description = stripHtml(event.description || "");
  // Built from the site's canonical env var, not window.location.href — this
  // renders during SSR too (a plain string href, no client-only APIs), so it
  // must produce the exact same value on the server and after hydration.
  const path = event.slug ? `/${event.slug}` : `/${orgSlug}/events/${event.id}/register`;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || "https://eventbuddy.africa"}${path}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//eventbuddy//event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@eventbuddy.africa`,
    // Not wall-clock "now" — this href is computed during render (server and
    // client both), so it has to be deterministic from event data alone or the
    // two renders disagree and React flags a hydration mismatch. DTSTAMP is
    // metadata for calendar-sync conflict resolution, irrelevant to a one-off
    // downloaded file like this one, so reusing DTSTART costs nothing real.
    `DTSTAMP:${toGCalStamp(start)}`,
    `DTSTART:${toGCalStamp(start)}`,
    `DTEND:${toGCalStamp(end)}`,
    `SUMMARY:${icsEscape(event.name)}`,
    ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
    `LOCATION:${icsEscape(location)}`,
    ...(url ? [`URL:${icsEscape(url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(icsFold)
    .join("\r\n");

  return lines;
}

/** Downloads via a real Blob object URL rather than a data: href — the only
 *  reliable cross-browser way to trigger a file download, notably including
 *  Safari (the primary audience for an "Apple / Outlook" button), which
 *  ignores `download` on data: URIs and just navigates to them instead. */
function downloadIcs(event: PublicEvent, orgSlug: string) {
  const blob = new Blob([buildIcsContent(event, orgSlug)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.name.replace(/[^a-z0-9]/gi, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

/** Collapses the two calendar-export options behind one button so the hero CTA
 *  row (Register / Add to calendar) needs at most one wrap on a narrow phone
 *  instead of clipping off-screen — three separate buttons here (Register,
 *  Google Calendar, Apple/Outlook) genuinely didn't fit at once. */
function AddToCalendarMenu({ event, orgSlug }: { event: PublicEvent; orgSlug: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-fg-2 border border-line bg-surface hover:bg-canvas transition-colors whitespace-nowrap"
      >
        <CalendarPlus size={16} />
        Add to calendar
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-52 bg-surface rounded-xl border border-line shadow-lg py-1 animate-dropdown-settle origin-top-right">
          <a
            href={buildGoogleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3.5 py-2.5 text-sm text-fg-2 hover:bg-canvas"
          >
            Google Calendar
          </a>
          <button
            type="button"
            onClick={() => {
              downloadIcs(event, orgSlug);
              setOpen(false);
            }}
            className="block w-full text-left px-3.5 py-2.5 text-sm text-fg-2 hover:bg-canvas"
          >
            Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
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
 *    org-scoped slug), kept working for any link shared before the short /[slug]
 *    form existed or for an event with no global slug set.
 *  - /[slug] (src/app/[orgSlug]/page.tsx) — the short universal public link format,
 *    which resolves the owning org first (see public_event_by_slug) then renders
 *    this unchanged. /discover/[slug] still works too, redirecting here.
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
  // True only when this event was reached via the fallback single-event lookup
  // (see the fetch effect below) — the normal /events list only ever returns
  // published events, so landing there at all means it's still a draft. Puts
  // the whole page in view-only preview mode: same link works before AND
  // after publishing, just without a working Register button until then.
  const [isDraftPreview, setIsDraftPreview] = useState(false);

  const [ticketTypes, setTicketTypes] = useState<PublicTicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [guests, setGuests] = useState<GroupGuest[]>([]);
  // "Just me" vs "Group": only offered when the event sells both kinds.
  const [ticketMode, setTicketMode] = useState<"single" | "group">("single");
  const [guestError, setGuestError] = useState("");

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
  const [orgLogoUrl, setOrgLogoUrl] = useState("");
  const [attendeeSummary, setAttendeeSummary] = useState<{ totalCount: number; sampleNames: string[] } | null>(null);

  // eventIdOrSlug may be the event's real id, an org-scoped slug, or a global slug
  // (see migration 0057) — all are matched here against the org's full event list,
  // and every API call after this point uses the resolved `found.id` (the real
  // uuid), never the raw param, since none of those routes understand slugs.
  //
  // That list (/events) only ever returns published events, so a still-draft
  // event is never in it — not found there falls back to a single-event lookup
  // with no published/date filter at all (migration 0080), which is what makes
  // the SAME link work before publishing too, in this page's own view-only
  // preview mode, rather than needing a separate preview-only URL. Deliberately
  // no view-count/attendee-summary tracking on that fallback path, since a
  // preview visit isn't a real visitor.
  useEffect(() => {
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events`)
      .then((res) => res.json())
      .then(async (eventsData) => {
        if (eventsData.error) {
          setLoadError(eventsData.error);
          return;
        }
        const found = (eventsData.events as PublicEvent[]).find((e) => e.id === eventIdOrSlug || (e.slug && e.slug === eventIdOrSlug));
        if (found) {
          setEvent(found);
          setIsDraftPreview(false);
          setOrgName(eventsData.organization?.name ?? "");
          setOrgLogoUrl(eventsData.organization?.logoUrl ?? "");
          const ticketsData = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${found.id}/tickets`).then((res) => res.json());
          const tickets = (ticketsData.ticketTypes as PublicTicketType[]) || [];
          setTicketTypes(tickets);
          if (tickets.length === 1) setSelectedTicketId(tickets[0].id);
          // Remember which partner's link brought this visitor, now that the
          // event id is known. Survives navigating away and coming back.
          captureRef(found.id);
          fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${found.id}/register/view`, { method: "POST" }).catch(() => {});
          fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${found.id}/attendee-summary`)
            .then((res) => res.json())
            .then((json) => setAttendeeSummary({ totalCount: json.totalCount ?? 0, sampleNames: json.sampleNames ?? [] }))
            .catch(() => {});
          return;
        }

        const previewData = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventIdOrSlug)}/preview`).then((res) => res.json());
        if (previewData.error) {
          setLoadError("This event couldn't be found — it may have ended or the link may be incorrect.");
          return;
        }
        const previewEvent = previewData.event as PublicEvent;
        setEvent(previewEvent);
        setIsDraftPreview(previewEvent.published === false);
        setOrgName(previewData.organization?.name ?? "");
        setOrgLogoUrl(previewData.organization?.logoUrl ?? "");
        const ticketsData = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${previewEvent.id}/tickets`).then((res) => res.json());
        const tickets = (ticketsData.ticketTypes as PublicTicketType[]) || [];
        setTicketTypes(tickets);
        if (tickets.length === 1) setSelectedTicketId(tickets[0].id);
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug, eventIdOrSlug]);

  useEffect(() => {
    if (!confirmation?.referenceId) return;
    brandedQrDataUrl(confirmation.referenceId, { width: 220, margin: 1 })
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
          let guestCount = 0;
          if (storedIdentity) {
            try {
              const parsed = JSON.parse(storedIdentity);
              guestCount = Number(parsed.guestCount) || 0;
              setAttendeeIdentity({ fullName: parsed.fullName, email: parsed.email, phone: parsed.phone });
            } catch {
              // Malformed/stale value — the 1-on-1 step just won't have a name/email
              // prefilled, no worse than if this round-trip storage didn't exist.
            }
            sessionStorage.removeItem(PENDING_IDENTITY_KEY);
          }
          setConfirmation({
            referenceId: json.referenceId ?? undefined,
            emailSent: true,
            guestCount,
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
    if (isDraftPreview) {
      setSubmitError("This event isn't published yet — registration isn't available until it is.");
      return;
    }
    const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
    // Group tickets: check the guests here first so the buyer sees the problem
    // next to the fields, not after a round trip (the API enforces it too).
    const groupSize = selectedTicket?.groupSize ?? 1;
    const guestCheck = validateGroupGuests(groupSize, guests.slice(0, groupSize - 1), values.email);
    if (!guestCheck.ok) {
      setGuestError(guestCheck.error);
      return;
    }
    setGuestError("");
    const identity = {
      fullName: `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || undefined,
      guestCount: guestCheck.guests.length,
    };
    setSubmitError("");
    setSubmitting(true);
    try {
      if (selectedTicket && selectedTicket.priceNaira > 0) {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/ticket-purchase/initialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: event.id, ticketTypeId: selectedTicket.id, discountCode: appliedDiscount?.code, ref: storedRef(event.id), ...values, guests: guestCheck.guests }),
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
        body: JSON.stringify({ eventId: event.id, ticketTypeId: selectedTicket?.id, ref: storedRef(event.id), ...values }),
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
    await copyText(confirmation.referenceId);
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
    await copyText(url);
    toast.success("Link copied");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <PublicHeader />
        <div className="flex items-center justify-center py-32">
          <MapPinCheckInside size={26} className="text-[#FF8AF5]/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="min-h-screen bg-canvas">
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
      <div className="min-h-screen bg-canvas">
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
      <div className="min-h-screen bg-canvas">
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

  const status = getEventStatus({ date: event.date, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime, timezone: event.timezone });

  // A past event still renders a fully live-looking registration page unless
  // stopped here — the server-side gate (getRegistrationGate) only rejects the
  // actual submit, after a visitor has filled out the whole form. Respects an
  // organizer's explicit capture_override: 'open' (e.g. collecting late
  // responses after the fact), same override the server-side gate honors.
  if (status === "completed" && event.captureOverride !== "open") {
    return (
      <div className="min-h-screen bg-canvas">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="text-center text-white/60 max-w-sm">
            <p className="font-medium text-white">{event.name} has already happened.</p>
            <p className="text-sm mt-1">This event ended on {formatDate(event.endDate || event.date)} — registration is no longer open.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId);
  const hasBothKinds = ticketTypes.some((t) => t.groupSize > 1) && ticketTypes.some((t) => t.groupSize <= 1);
  const visibleTicketTypes = hasBothKinds ? ticketTypes.filter((t) => (ticketMode === "group" ? t.groupSize > 1 : t.groupSize <= 1)) : ticketTypes;
  const discountedPrice =
    selectedTicket && appliedDiscount ? applyDiscount(selectedTicket.priceNaira, appliedDiscount.discountType, appliedDiscount.discountValue, appliedDiscount.maxDiscountNaira) : null;

  const minPriceNaira = ticketTypes.length > 0 ? Math.min(...ticketTypes.map((t) => t.priceNaira)) : 0;
  const isFreeEvent = ticketTypes.length === 0 || minPriceNaira === 0;
  const ctaLabel = ticketCtaLabel(ticketTypes.map((t) => t.priceNaira));
  const priceLabel = isFreeEvent ? "Free" : ticketTypes.length > 1 ? `From ${formatNaira(minPriceNaira)}` : formatNaira(minPriceNaira);

  const badges = [STATUS_LABEL[status], event.eventFormat === "virtual" ? "Virtual" : "In Person", event.category].filter(Boolean) as string[];

  const showOneOnOneStep =
    !!confirmation && confirmation.status !== "pending" && confirmation.status !== "waitlisted" && oneOnOneEnabled && !oneOnOneDismissed;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Ambient glow behind the glass cards — fixed + its own overflow-hidden so it
          never affects the sticky registration panel's containing block. Purely
          atmospheric: slow, low-opacity, never the thing a visitor consciously notices. */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-[#C21FAF]/25 blur-[110px] animate-aurora-a" />
        <div className="absolute top-1/3 -right-32 w-[560px] h-[560px] rounded-full bg-[#6D28D9]/25 blur-[120px] animate-aurora-b" />
      </div>

      <div className="relative z-10">
      <PublicHeader />
      {isDraftPreview && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
            <Eye size={15} className="shrink-0" />
            Preview only — this is what your event page will look like once published. Registration isn&apos;t open yet.
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14">
        {/* Hero — cover image + title/badges/CTA, matching the composition of a real
            event landing page rather than the plain header band this used to be. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-8 items-start animate-fade-in-up">
          <div className="aspect-video rounded-2xl overflow-hidden bg-fill shadow-sm">
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
                  <span key={b} className="text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-brand-500/15 text-brand-500 ring-1 ring-inset ring-brand-500/25">
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
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#register-panel"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap"
                data-cta
              >
                <Ticket size={16} />
                {ctaLabel === "Register" ? "Register free" : ctaLabel === "Buy Ticket" ? `Buy Ticket · ${priceLabel}` : ctaLabel}
              </a>
              <AddToCalendarMenu event={event} orgSlug={orgSlug} />
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 mt-10 items-start">
          <div className="space-y-5 min-w-0">
            {event.description && (
              <div className="bg-surface/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "0ms" }}>
                <h2 className="font-semibold text-white mb-2">About this event</h2>
                <RichTextDisplay html={event.description} className="text-sm text-white/70 leading-relaxed" />
              </div>
            )}

            <div
              className="bg-surface/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up"
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
                className="bg-surface/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up"
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
                className="bg-surface/10 backdrop-blur-xl border border-white/15 rounded-2xl p-6 animate-fade-in-up"
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

            {event.eventFormat !== "virtual" && <ExhibitorStrip eventId={event.id} />}
            {event.eventFormat !== "virtual" && <ExhibitCta eventId={event.id} />}

            <div className="animate-fade-in-up" style={{ animationDelay: event.description ? "180ms" : "120ms" }}>
              <EventHostCard orgSlug={orgSlug} eventId={event.id} orgName={orgName} orgLogoUrl={orgLogoUrl} attendeeSummary={attendeeSummary} />
            </div>
          </div>

          {/* Sticky registration panel — this is the real, functional form: ticket
              picker, discount code, dynamic fields, submit. Not a decorative summary
              card standing in for it. */}
          <div id="register-panel" className="lg:sticky lg:top-8 scroll-mt-8 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
            <div className="bg-surface/10 backdrop-blur-xl border border-white/15 rounded-2xl shadow-xl overflow-hidden">
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
                    {confirmation.guestCount
                      ? ` Your ${confirmation.guestCount} guest${confirmation.guestCount === 1 ? "" : "s"} each got their own ticket and QR code by email.`
                      : ""}
                  </p>

                  {confirmation.referenceId && (
                    <>
                      {qrDataUrl && (
                        <div className="inline-block p-3 eb-light rounded-lg mb-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrDataUrl} alt="Registration QR code" width={164} height={164} />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={copyReferenceId}
                        className="flex mx-auto items-center gap-2 px-4 py-2 rounded-lg border border-white/20 bg-surface/5 font-mono text-base font-semibold text-white hover:bg-surface/10"
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
                      data-cta
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
                      <div className="flex items-center justify-between gap-3 p-3.5 mb-5 rounded-xl bg-surface/5 border border-white/15">
                        <div className="min-w-0">
                          <p className="text-sm text-white/80 flex items-center gap-2">
                            <Ticket size={14} className="text-[#FF8AF5]" />
                            {ticketTypes[0].name}
                          </p>
                          {ticketTypes[0].groupSize > 1 && (
                            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#FF8AF5]/15 px-2 py-0.5 text-[11px] font-semibold text-[#FF8AF5]">
                              <Users size={11} aria-hidden="true" /> Admits {ticketTypes[0].groupSize} · {formatNaira(Math.round(ticketTypes[0].priceNaira / ticketTypes[0].groupSize))} each
                            </p>
                          )}
                        </div>
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
                        {hasBothKinds && (
                          <div role="radiogroup" aria-label="Who is this for?" className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/15 bg-white/[0.03] p-1">
                            {(
                              [
                                { mode: "single", label: "Just me", Icon: Ticket },
                                { mode: "group", label: "Group", Icon: Users },
                              ] as const
                            ).map(({ mode, label, Icon }) => {
                              const on = ticketMode === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => {
                                    if (on) return;
                                    setTicketMode(mode);
                                    // a mode with one ticket needs no second tap
                                    const inMode = ticketTypes.filter((t) => (mode === "group" ? t.groupSize > 1 : t.groupSize <= 1) && isTicketAvailable(t));
                                    setSelectedTicketId(inMode.length === 1 ? inMode[0].id : null);
                                    setGuestError("");
                                    handleRemoveDiscount();
                                  }}
                                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
                                    on ? "bg-[#FF8AF5] text-[#1a0b1f]" : "text-white/60 hover:text-white"
                                  }`}
                                >
                                  <Icon size={14} aria-hidden="true" /> {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="space-y-3">
                          {visibleTicketTypes.map((t) => (
                            <TicketStub
                              key={t.id}
                              t={t}
                              tone={TICKET_TONES[ticketTypes.indexOf(t) % TICKET_TONES.length]}
                              available={isTicketAvailable(t)}
                              selected={selectedTicketId === t.id}
                              onSelect={() => {
                                setSelectedTicketId(t.id);
                                handleRemoveDiscount();
                              }}
                            />
                          ))}
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
                                className="flex-1 px-3.5 py-2.5 rounded-lg border border-white/20 bg-surface/5 text-white placeholder:text-white/40 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF8AF5]"
                              />
                              <button
                                type="button"
                                onClick={handleApplyDiscount}
                                disabled={validatingDiscount || !discountCodeInput.trim()}
                                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-white/20 text-white hover:bg-surface/10 disabled:opacity-50"
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
                      <DynamicRegistrationForm
                        fields={event.customFields || []}
                        onSubmit={handleSubmit}
                        submitting={submitting}
                        submitError=""
                        onProgress={handleFormProgress}
                        submitLabel={
                          selectedTicket && selectedTicket.priceNaira > 0
                            ? selectedTicket.groupSize > 1
                              ? `Buy Ticket for ${selectedTicket.groupSize} people`
                              : "Buy Ticket"
                            : undefined
                        }
                        submittingLabel={selectedTicket && selectedTicket.priceNaira > 0 ? "Opening payment…" : undefined}
                        beforeSubmit={
                          selectedTicket && selectedTicket.groupSize > 1 ? (
                            <GroupGuestFields groupSize={selectedTicket.groupSize} guests={guests} onChange={setGuests} error={guestError} />
                          ) : undefined
                        }
                      />
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
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white/70 border-t border-white/10 hover:bg-surface/5 transition-colors"
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

      <div className="mt-16"><LandingFooter /></div>
      </div>
    </div>
  );
}
