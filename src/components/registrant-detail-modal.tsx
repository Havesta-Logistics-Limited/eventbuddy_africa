"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { X, QrCode, Mail, Phone, Calendar, CheckCircle2, MapPin, BookMarked, GraduationCap, Globe2, Building2, MessageSquare } from "lucide-react";
import { Destination, EventRecord, LeadRecord, RegistrationRecord, University } from "@/lib/types";
import { updateRegistrationStatus } from "@/lib/store";

const statusStyles: Record<RegistrationRecord["status"], string> = {
  registered: "bg-amber-100 text-amber-700",
  checked_in: "bg-teal-100 text-teal-700",
  cancelled: "bg-slate-100 text-slate-500",
};
const statusLabels: Record<RegistrationRecord["status"], string> = {
  registered: "Registered",
  checked_in: "Checked in",
  cancelled: "Cancelled",
};

/** Full detail view for one registrant — their registration form answers, their QR
 *  check-in code, and (when a staff member has pulled them into a lead at a booth) the
 *  academic detail captured for them, since that's where those fields actually live in
 *  our schema rather than on the registration itself. */
export function RegistrantDetailModal({
  registration,
  event,
  lead,
  destination,
  university,
  checkedInByName,
  onClose,
}: {
  registration: RegistrationRecord;
  event: EventRecord;
  lead?: LeadRecord;
  destination?: Destination;
  university?: University;
  checkedInByName?: string;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const customFields = event.customFields ?? [];

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
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
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <QrCode size={15} /> {showQr ? "Hide QR Code" : "Show QR Code"}
              </button>
              {registration.status !== "cancelled" && (
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
    </div>
  );
}
