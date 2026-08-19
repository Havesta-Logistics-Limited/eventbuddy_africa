"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { AlertCircle, Calendar, Check, Copy, MapPin, Video } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { DynamicRegistrationForm, type DynamicRegistrationFormValues } from "@/components/dynamic-registration-form";
import { formatDate } from "@/lib/utils";

type PublicEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };

type Confirmation = {
  referenceId: string;
  emailSent: boolean;
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

export default function RegisterPage() {
  const params = useParams<{ orgSlug: string; eventId: string }>();
  const { orgSlug, eventId } = params;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [event, setEvent] = useState<PublicEvent | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        const found = (data.events as PublicEvent[]).find((e) => e.id === eventId);
        if (!found) {
          setLoadError("This event couldn't be found — it may have ended or the link may be incorrect.");
          return;
        }
        setEvent(found);
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug, eventId]);

  useEffect(() => {
    if (!confirmation) return;
    QRCode.toDataURL(confirmation.referenceId, { width: 220, margin: 1, color: { dark: "#1e1b2e", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [confirmation]);

  async function handleSubmit(values: DynamicRegistrationFormValues) {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, ...values }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Couldn't complete your registration. Please try again.");
        return;
      }
      setConfirmation({ referenceId: json.referenceId, emailSent: !!json.emailSent, event: json.event });
    } catch {
      setSubmitError("Couldn't complete your registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyReferenceId() {
    if (!confirmation) return;
    await navigator.clipboard.writeText(confirmation.referenceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="min-h-screen bg-slate-50" />;

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

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="pt-12 pb-8 px-4" style={{ background: "#610064" }}>
        <div className="max-w-xl mx-auto text-white">
          <p className="text-xs uppercase tracking-wider text-white/60 mb-2">Event registration</p>
          <h1 className="font-display text-2xl mb-3">{event.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {formatDate(event.date)}
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
              {confirmation.emailSent ? "We've also emailed you this confirmation. Keep it — you'll need it to check in." : "Keep this reference ID — you'll need it to check in."}
            </p>

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

            {confirmation.event.eventFormat === "virtual" ? (
              <div className="mt-6 pt-5 border-t border-slate-100 text-left">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Joining details</h3>
                {confirmation.event.virtualJoinUrl && (
                  <a href={confirmation.event.virtualJoinUrl} target="_blank" rel="noreferrer" className="block text-sm text-[#610064] hover:underline break-all">
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
            {submitError && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}
            <DynamicRegistrationForm fields={event.customFields || []} onSubmit={handleSubmit} submitting={submitting} submitError="" />
          </div>
        )}
      </div>
    </div>
  );
}
