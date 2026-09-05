"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import { AlertCircle, Calendar, Check, Copy, ExternalLink, HelpCircle, MapPin, MapPinCheckInside, ThumbsDown, ThumbsUp, Video, X } from "lucide-react";
import { FieldDef } from "@/lib/types";
import { formatDate, formatTime, safeHttpUrl } from "@/lib/utils";
import { RichTextDisplay } from "@/components/rich-text-display";

type RsvpEvent = {
  name: string;
  date: string;
  startTime?: string;
  endTime?: string;
  eventFormat: "physical" | "virtual";
  virtualJoinUrl?: string;
  virtualPlatform?: string;
  virtualAccessNotes?: string;
  venue?: string;
  location?: string;
  description?: string;
  customFields: FieldDef[];
};

type GuestInfo = { fullName: string; email: string; status: "pending" | "accepted" | "declined" | "maybe"; plusOnesAllowed: number; plusOnesConfirmed: number | null };

type Attendee = { name: string; referenceId?: string; emailSent: boolean; hubUrl?: string };
type Confirmation = { status: "accepted" | "declined" | "maybe"; attendees?: Attendee[] };

type PlusOneRow = { name: string; email: string };

const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C21FAF] focus:border-transparent";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

function CustomFieldInput({ field, value, onChange }: { field: FieldDef; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const label = `${field.label || "Untitled question"}${field.required ? " *" : ""}`;
  if (field.type === "paragraph") {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <textarea rows={3} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} resize-none`} />
      </div>
    );
  }
  if (field.type === "dropdown") {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <select value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} cursor-pointer`}>
          <option value="">Select an option</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === "multiple_choice") {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <div className="grid grid-cols-2 gap-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm cursor-pointer hover:border-slate-300">
              <input type="radio" checked={value === opt} onChange={() => onChange(opt)} className="accent-[#C21FAF]" />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "checkboxes") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <div className="grid grid-cols-2 gap-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm cursor-pointer hover:border-slate-300">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => onChange(e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt))}
                className="accent-[#C21FAF]"
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "date" ? "date" : "text"}
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

export default function RsvpPage() {
  const params = useParams<{ orgSlug: string; eventId: string }>();
  const { orgSlug, eventId } = params;
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [event, setEvent] = useState<RsvpEvent | null>(null);
  const [guest, setGuest] = useState<GuestInfo | null>(null);

  const [plusOnes, setPlusOnes] = useState<PlusOneRow[]>([]);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState<"accepted" | "declined" | "maybe" | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [showDetailsStep, setShowDetailsStep] = useState(false);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError("This invite link is missing its access token — check the link in your email and try again.");
      setLoading(false);
      return;
    }
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/rsvp?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setLoadError(json.error);
          return;
        }
        setEvent(json.event);
        setGuest(json.guest);
      })
      .catch(() => setLoadError("Couldn't load this invite. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug, eventId, token]);

  useEffect(() => {
    const refs = (confirmation?.attendees ?? []).filter((a) => a.referenceId).map((a) => a.referenceId!);
    if (refs.length === 0) return;
    Promise.all(refs.map((ref) => QRCode.toDataURL(ref, { width: 200, margin: 1, color: { dark: "#1e1b2e", light: "#ffffff" } }).then((url) => [ref, url] as const))).then(
      (pairs) => setQrDataUrls(Object.fromEntries(pairs))
    );
  }, [confirmation]);

  function updatePlusOneRow(index: number, patch: Partial<PlusOneRow>) {
    setPlusOnes((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function submitResponse(response: "accepted" | "declined" | "maybe") {
    setSubmitError("");
    setSubmitting(response);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          response,
          plusOnes: response === "accepted" ? plusOnes.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), email: p.email.trim() || undefined })) : undefined,
          customAnswers: response === "accepted" ? customAnswers : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Couldn't record your response. Please try again.");
        return;
      }
      setConfirmation({ status: json.status, attendees: json.attendees });
    } catch {
      setSubmitError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(null);
    }
  }

  async function copyReferenceId(ref: string) {
    await navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    toast.success("Reference ID copied");
    setTimeout(() => setCopiedRef(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <MapPinCheckInside size={26} className="text-[#C21FAF]/40 animate-pulse" />
      </div>
    );
  }

  if (loadError || !event || !guest) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500 max-w-sm">
          <p className="font-medium text-slate-700">{loadError || "This invite couldn't be found."}</p>
          <p className="text-sm mt-1">Check the link in your invite email and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="pt-12 pb-8 px-4" style={{ background: "#6D28D9" }}>
        <div className="max-w-xl mx-auto text-white">
          <p className="text-xs uppercase tracking-wider text-white/60 mb-2">You&apos;re invited</p>
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
            {confirmation.status === "accepted" ? (
              <>
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto mb-4">
                  <Check size={22} />
                </div>
                <h2 className="font-semibold text-lg text-slate-900 mb-1">
                  {confirmation.attendees && confirmation.attendees.length > 1 ? "You're all on the list!" : "You're on the list!"}
                </h2>
                <p className="text-sm text-slate-500 mb-6">
                  {event.eventFormat === "virtual"
                    ? "We've emailed joining details to everyone in your party — just join at the time above, no check-in needed."
                    : "We've emailed a confirmation to each person below — keep these, you'll need them to check in."}
                </p>

                <div className="space-y-5 text-left">
                  {(confirmation.attendees ?? []).map((a, i) => (
                    <div key={i} className={i > 0 ? "pt-5 border-t border-slate-100" : ""}>
                      <p className="text-sm font-semibold text-slate-800 mb-2 text-center">{a.name}</p>
                      {a.referenceId && (
                        <div className="text-center">
                          {qrDataUrls[a.referenceId] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={qrDataUrls[a.referenceId]} alt={`${a.name}'s QR code`} className="mx-auto mb-3 rounded-lg border border-slate-200" width={160} height={160} />
                          )}
                          <button
                            type="button"
                            onClick={() => copyReferenceId(a.referenceId!)}
                            className="inline-flex items-center gap-2 mx-auto px-4 py-2 rounded-lg border border-slate-200 font-mono text-sm font-semibold text-slate-800 hover:bg-slate-50"
                          >
                            {a.referenceId}
                            {copiedRef === a.referenceId ? <Check size={14} className="text-teal-600" /> : <Copy size={14} className="text-slate-400" />}
                          </button>
                        </div>
                      )}
                      {a.hubUrl && (
                        <a
                          href={a.hubUrl}
                          className="mt-3 flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 w-fit"
                          style={{ background: "#C21FAF" }}
                        >
                          <ExternalLink size={13} />
                          Open event hub
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {event.eventFormat === "virtual" && safeHttpUrl(event.virtualJoinUrl) && (
                  <div className="mt-6 pt-5 border-t border-slate-100 text-left">
                    <h3 className="text-sm font-semibold text-slate-800 mb-2">Joining details</h3>
                    <a href={safeHttpUrl(event.virtualJoinUrl)} target="_blank" rel="noreferrer" className="block text-sm text-[#C21FAF] hover:underline break-all">
                      {event.virtualJoinUrl}
                    </a>
                    {event.virtualAccessNotes && <p className="text-sm text-slate-500 mt-2 whitespace-pre-line">{event.virtualAccessNotes}</p>}
                  </div>
                )}
              </>
            ) : confirmation.status === "declined" ? (
              <>
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
                  <ThumbsDown size={20} />
                </div>
                <h2 className="font-semibold text-lg text-slate-900 mb-1">Thanks for letting us know</h2>
                <p className="text-sm text-slate-500">We&apos;ve marked you as not attending {event.name}. Changed your mind? Just open this link again.</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
                  <HelpCircle size={20} />
                </div>
                <h2 className="font-semibold text-lg text-slate-900 mb-1">Got it — you&apos;re a maybe</h2>
                <p className="text-sm text-slate-500">Come back and open this link again whenever you know for sure.</p>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-600 mb-1">Hi {guest.fullName.split(" ")[0]},</p>
            {event.description && <RichTextDisplay html={event.description} className="text-sm text-slate-600 mb-5" />}

            {submitError && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}

            {showDetailsStep ? (
              <div className="space-y-5">
                {guest.plusOnesAllowed > 0 && (
                  <div>
                    <label className={labelClass}>Bringing anyone? (up to {guest.plusOnesAllowed})</label>
                    <div className="space-y-2.5">
                      {plusOnes.map((row, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2">
                          <input
                            value={row.name}
                            onChange={(e) => updatePlusOneRow(i, { name: e.target.value })}
                            placeholder="Guest name"
                            className={fieldClass}
                          />
                          <input
                            value={row.email}
                            onChange={(e) => updatePlusOneRow(i, { email: e.target.value })}
                            placeholder="Their email (optional)"
                            className={fieldClass}
                          />
                        </div>
                      ))}
                      {plusOnes.length < guest.plusOnesAllowed && (
                        <button
                          type="button"
                          onClick={() => setPlusOnes((rows) => [...rows, { name: "", email: "" }])}
                          className="text-sm font-medium text-[#C21FAF] hover:underline"
                        >
                          + Add {plusOnes.length === 0 ? "a guest" : "another guest"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {event.customFields.length > 0 && (
                  <div className="space-y-4 pt-1">
                    {event.customFields.map((f) => (
                      <CustomFieldInput
                        key={f.id}
                        field={f}
                        value={customAnswers[f.id]}
                        onChange={(v) => setCustomAnswers((prev) => ({ ...prev, [f.id]: v }))}
                      />
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => submitResponse("accepted")}
                  disabled={submitting !== null}
                  className="w-full py-3 rounded-xl font-semibold text-white text-base disabled:opacity-60"
                  style={{ background: "#C21FAF" }}
                >
                  {submitting ? "Confirming…" : "Confirm — I'm attending"}
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => (guest.plusOnesAllowed > 0 || event.customFields.length > 0 ? setShowDetailsStep(true) : submitResponse("accepted"))}
                  disabled={submitting !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-base disabled:opacity-60"
                  style={{ background: "#C21FAF" }}
                >
                  <ThumbsUp size={16} />
                  {submitting === "accepted" ? "Confirming…" : "Yes, I'll be there"}
                </button>
                <button
                  type="button"
                  onClick={() => submitResponse("maybe")}
                  disabled={submitting !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <HelpCircle size={16} />
                  {submitting === "maybe" ? "Saving…" : "Not sure yet"}
                </button>
                <button
                  type="button"
                  onClick={() => submitResponse("declined")}
                  disabled={submitting !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                >
                  <X size={16} />
                  {submitting === "declined" ? "Saving…" : "Can't make it"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
