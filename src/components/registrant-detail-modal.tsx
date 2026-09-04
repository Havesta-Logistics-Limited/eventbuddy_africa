"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { X, QrCode, Mail, Phone, Calendar, CheckCircle2, MapPin, BookMarked, GraduationCap, Globe2, Building2, MessageSquare, Ticket, Send, Check, ArrowUpCircle, Undo2, AlertCircle } from "lucide-react";
import { Destination, EventRecord, LeadRecord, RegistrationRecord, TicketType, University } from "@/lib/types";
import { updateRegistrationStatus, decideRegistration, refundRegistration } from "@/lib/store";
import { formatNaira } from "@/lib/billing";
import { statusStyles, statusLabels } from "@/components/prospects-tab";

/** Full detail view for one registrant — their registration form answers, their QR
 *  check-in code, and (when a staff member has pulled them into a lead at a booth) the
 *  academic detail captured for them, since that's where those fields actually live in
 *  our schema rather than on the registration itself. */
export function RegistrantDetailModal({
  registration,
  event,
  orgSlug,
  lead,
  destination,
  university,
  checkedInByName,
  ticketType,
  onClose,
}: {
  registration: RegistrationRecord;
  event: EventRecord;
  orgSlug: string;
  lead?: LeadRecord;
  destination?: Destination;
  university?: University;
  checkedInByName?: string;
  ticketType?: TicketType;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");
  const customFields = event.customFields ?? [];
  const canRefund = !!ticketType && ticketType.priceNaira > 0 && registration.status !== "cancelled" && registration.status !== "declined";

  async function resendEmail() {
    setResending(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(event.id)}/registrations/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: registration.id }),
      });
      const json = await res.json();
      if (!res.ok || json.sentCount === 0) {
        toast.error(json.error || "Couldn't resend the confirmation email.");
        return;
      }
      toast.success(`Confirmation email resent to ${registration.email}`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    QRCode.toDataURL(registration.referenceId, { width: 220, margin: 1, color: { dark: "#1e1b2e", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [registration.referenceId]);

  async function toggleCheckedIn() {
    setBusy(true);
    try {
      await updateRegistrationStatus(registration.id, registration.status === "checked_in" ? "registered" : "checked_in");
    } catch {
      toast.error("Couldn't update check-in status. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund() {
    setRefunding(true);
    setRefundError("");
    try {
      await refundRegistration(orgSlug, event.id, registration.id);
      toast.success("Refunded — the attendee has been emailed.");
      setShowRefundConfirm(false);
      onClose();
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Couldn't process this refund.");
    } finally {
      setRefunding(false);
    }
  }

  async function decide(action: "approve" | "decline" | "promote") {
    setBusy(true);
    try {
      await decideRegistration(orgSlug, event.id, registration.id, "registration", action);
      toast.success(action === "approve" ? "Approved" : action === "decline" ? "Declined" : "Promoted from waitlist");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update this registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop" onClick={onClose}>
      <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Registration details</p>
            <h2 className="font-display text-xl text-slate-900">{registration.fullName}</h2>
            <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[registration.status]}`}>
              {statusLabels[registration.status]}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-slate-600">
                <Mail size={14} className="text-slate-400" /> {registration.email}
              </p>
              {registration.phone && (
                <p className="flex items-center gap-2 text-slate-600">
                  <Phone size={14} className="text-slate-400" /> {registration.phone}
                </p>
              )}
              <p className="flex items-center gap-2 text-slate-600">
                <Calendar size={14} className="text-slate-400" /> Registered {new Date(registration.createdAt).toLocaleString()}
              </p>
              {registration.checkedInAt && (
                <p className="flex items-center gap-2 text-teal-700">
                  <CheckCircle2 size={14} /> Checked in {new Date(registration.checkedInAt).toLocaleString()}
                  {checkedInByName ? ` by ${checkedInByName}` : ""}
                </p>
              )}
              {ticketType && (
                <p className="flex items-center gap-2 text-slate-600">
                  <Ticket size={14} className="text-slate-400" /> {ticketType.name}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ticketType.priceNaira > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                    {ticketType.priceNaira > 0 ? formatNaira(ticketType.priceNaira) : "Free"}
                  </span>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <QrCode size={15} /> {showQr ? "Hide QR Code" : "Show QR Code"}
              </button>
              {(registration.status === "registered" || registration.status === "checked_in") && (
                <button
                  type="button"
                  onClick={resendEmail}
                  disabled={resending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Send size={15} /> {resending ? "Sending…" : "Resend Email"}
                </button>
              )}
              {(registration.status === "registered" || registration.status === "checked_in") && (
                <button
                  type="button"
                  onClick={toggleCheckedIn}
                  disabled={busy}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors ${
                    registration.status === "checked_in"
                      ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      : "text-white bg-brand-600 hover:bg-brand-700"
                  }`}
                >
                  <MapPin size={15} /> {busy ? "Updating…" : registration.status === "checked_in" ? "Undo Check-in" : "Check Into This Event"}
                </button>
              )}
              {registration.status === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => decide("approve")}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check size={15} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => decide("decline")}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-200 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    <X size={15} /> Decline
                  </button>
                </>
              )}
              {registration.status === "waitlisted" && (
                <>
                  <button
                    type="button"
                    onClick={() => decide("promote")}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
                  >
                    <ArrowUpCircle size={15} /> Promote
                  </button>
                  <button
                    type="button"
                    onClick={() => decide("decline")}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-200 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    <X size={15} /> Decline
                  </button>
                </>
              )}
              {canRefund && (
                <button
                  type="button"
                  onClick={() => setShowRefundConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-200 text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  <Undo2 size={15} /> Refund
                </button>
              )}
            </div>
          </div>

          {showQr && (
            <div className="flex flex-col items-center gap-2 p-5 rounded-xl bg-slate-50 border border-slate-200">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt={`QR code for ${registration.referenceId}`} className="w-44 h-44" />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">Generating…</div>
              )}
              <p className="font-mono text-sm text-slate-600 tracking-wide">{registration.referenceId}</p>
              <p className="text-xs text-slate-400">The code this attendee was issued at registration</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Registration form answers</h3>
            {customFields.length === 0 ? (
              <p className="text-sm text-slate-400">This event&apos;s registration form has no additional questions.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {customFields.map((f) => {
                  const v = registration.customAnswers?.[f.id];
                  return (
                    <div key={f.id}>
                      <p className="text-xs text-slate-400">{f.label || "Untitled question"}</p>
                      <p className="text-sm text-slate-700 mt-0.5">{(Array.isArray(v) ? v.join(", ") : v) || "—"}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {lead && (
            <div className="pt-5 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Lead captured at this event</h3>
              <p className="text-xs text-slate-400 mb-3">Collected by staff when this attendee&apos;s code was scanned at a booth.</p>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {destination && (
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Globe2 size={11} /> Destination
                    </p>
                    <p className="text-slate-700 mt-0.5">
                      {destination.flag} {destination.name}
                    </p>
                  </div>
                )}
                {university && (
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Building2 size={11} /> University
                    </p>
                    <p className="text-slate-700 mt-0.5">{university.name}</p>
                  </div>
                )}
                {lead.preferredCourse && (
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <BookMarked size={11} /> Preferred course
                    </p>
                    <p className="text-slate-700 mt-0.5">{lead.preferredCourse}</p>
                  </div>
                )}
                {lead.levelOfInterest && (
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <GraduationCap size={11} /> Level of interest
                    </p>
                    <p className="text-slate-700 mt-0.5">{lead.levelOfInterest}</p>
                  </div>
                )}
                {lead.highestEducation && (
                  <div>
                    <p className="text-xs text-slate-400">Highest education</p>
                    <p className="text-slate-700 mt-0.5">{lead.highestEducation}</p>
                  </div>
                )}
                {lead.startYear && (
                  <div>
                    <p className="text-xs text-slate-400">Intended start year</p>
                    <p className="text-slate-700 mt-0.5">{lead.startYear}</p>
                  </div>
                )}
                {lead.takenIELTS && (
                  <div>
                    <p className="text-xs text-slate-400">IELTS status</p>
                    <p className="text-slate-700 mt-0.5">{lead.takenIELTS}</p>
                  </div>
                )}
                {lead.comments && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <MessageSquare size={11} /> Comments
                    </p>
                    <p className="text-slate-700 mt-0.5">{lead.comments}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showRefundConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-sm shadow-2xl p-6">
            <h2 className="font-semibold text-slate-900 text-lg mb-2">Refund this ticket?</h2>
            <p className="text-sm text-slate-600">
              This reverses the charge on Paystack and cancels <span className="font-semibold">{registration.fullName}</span>&apos;s registration. They&apos;ll be emailed automatically. This
              can&apos;t be undone from here.
            </p>
            {refundError && (
              <div className="flex items-start gap-2 p-3 mt-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {refundError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowRefundConfirm(false)}
                disabled={refunding}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRefund}
                disabled={refunding}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
              >
                {refunding ? "Refunding…" : "Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
