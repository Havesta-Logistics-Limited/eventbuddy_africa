"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, UserCheck, Download, Loader2, Send, Check, X, ArrowUpCircle, ClipboardCheck, ListOrdered } from "lucide-react";
import { Destination, EventRecord, LeadRecord, RegistrationRecord, StaffRecord, TicketType, University } from "@/lib/types";
import { downloadCsv, registrationsToCsv } from "@/lib/csv";
import { updateRegistrationStatus, decideRegistration, updateEvent, PersistError } from "@/lib/store";
import { RegistrantDetailModal } from "@/components/registrant-detail-modal";
import { formatNaira } from "@/lib/billing";

/** The two event-level toggles that put new registrations into 'pending'/'waitlisted'
 *  instead of straight to 'registered' — shown here (not the creation wizard) since
 *  an organizer typically decides this after seeing how sign-ups are going, same
 *  reasoning as the 1-on-1 toggle living in its own dashboard tab rather than the
 *  wizard. Deliberately shown even with zero registrations yet — that's often exactly
 *  when an organizer wants to turn this on, before anyone's signed up. */
function RegistrationSettingsCard({ event }: { event: EventRecord }) {
  const [togglingApproval, setTogglingApproval] = useState(false);
  const [togglingWaitlist, setTogglingWaitlist] = useState(false);

  async function toggle(field: "requiresApproval" | "waitlistEnabled", current: boolean | undefined, setBusy: (v: boolean) => void) {
    setBusy(true);
    try {
      await updateEvent(event.id, { [field]: !current });
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this setting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck size={16} className="text-slate-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">Require approval</p>
            <p className="text-xs text-slate-500">New registrations start pending — review and approve or decline each one.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!event.requiresApproval}
          onClick={() => toggle("requiresApproval", event.requiresApproval, setTogglingApproval)}
          disabled={togglingApproval}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${event.requiresApproval ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${event.requiresApproval ? "translate-x-4" : ""}`} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
        <div className="flex items-center gap-2.5">
          <ListOrdered size={16} className="text-slate-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">Waitlist when sold out</p>
            <p className="text-xs text-slate-500">Once a capacity-limited ticket sells out, new sign-ups join a waitlist instead of being turned away.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!event.waitlistEnabled}
          onClick={() => toggle("waitlistEnabled", event.waitlistEnabled, setTogglingWaitlist)}
          disabled={togglingWaitlist}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${event.waitlistEnabled ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${event.waitlistEnabled ? "translate-x-4" : ""}`} />
        </button>
      </div>
    </div>
  );
}

export const statusStyles: Record<RegistrationRecord["status"], string> = {
  registered: "bg-amber-100 text-amber-700",
  checked_in: "bg-teal-100 text-teal-700",
  cancelled: "bg-slate-100 text-slate-500",
  pending: "bg-orange-100 text-orange-700",
  waitlisted: "bg-violet-100 text-violet-700",
  declined: "bg-rose-100 text-rose-700",
};
export const statusLabels: Record<RegistrationRecord["status"], string> = {
  registered: "Registered",
  checked_in: "Checked in",
  cancelled: "Cancelled",
  pending: "Pending",
  waitlisted: "Waitlisted",
  declined: "Declined",
};

/** Self-service registrants for this event, toggled between everyone who registered and
 *  just those who actually showed up — the Participants tile doubles as the attendance
 *  conversion rate (checked-in ÷ registered). The Checked In column lets an admin mark
 *  attendance by hand from here, on top of the physical /checkin scan flow at the door.
 *  Clicking a row opens the full detail modal (QR code, form answers, any lead captured
 *  for them). */
export function ProspectsTab({
  event,
  orgSlug,
  registrations,
  leads,
  destinations,
  universities,
  staff,
  ticketTypes,
}: {
  event: EventRecord;
  orgSlug: string;
  registrations: RegistrationRecord[];
  leads: LeadRecord[];
  destinations: Destination[];
  universities: University[];
  staff: StaffRecord[];
  ticketTypes: TicketType[];
}) {
  const [view, setView] = useState<"registrations" | "participants">("registrations");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resendingAll, setResendingAll] = useState(false);
  const customFields = event.customFields ?? [];

  async function resendAll() {
    setResendingAll(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(event.id)}/registrations/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't resend confirmation emails.");
        return;
      }
      toast.success(`Resent to ${json.sentCount} of ${json.totalCount} registrant${json.totalCount !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setResendingAll(false);
    }
  }

  async function decide(r: RegistrationRecord, action: "approve" | "decline" | "promote") {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await decideRegistration(orgSlug, event.id, r.id, "registration", action);
      toast.success(action === "approve" ? "Approved" : action === "decline" ? "Declined" : "Promoted from waitlist");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update this registration.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleCheckedIn(r: RegistrationRecord) {
    if (r.status === "cancelled" || r.status === "declined" || busyId) return;
    setBusyId(r.id);
    try {
      await updateRegistrationStatus(r.id, r.status === "checked_in" ? "registered" : "checked_in");
    } catch {
      toast.error("Couldn't update check-in status. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (registrations.length === 0) {
    return (
      <div>
        <RegistrationSettingsCard event={event} />
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
          <Users size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No registrations yet</p>
          <p className="text-xs text-slate-400 mt-1.5">Self-service sign-ups for this event will appear here.</p>
        </div>
      </div>
    );
  }

  const participants = registrations.filter((r) => r.status === "checked_in");
  const conversion = registrations.length === 0 ? 0 : Math.round((participants.length / registrations.length) * 100);
  const shown = view === "registrations" ? registrations : participants;

  const selected = selectedId ? (registrations.find((r) => r.id === selectedId) ?? null) : null;
  const selectedLead = selected ? leads.find((l) => l.registrationId === selected.id) : undefined;
  const selectedDest = selectedLead?.destinationId ? destinations.find((d) => d.id === selectedLead.destinationId) : undefined;
  const selectedUni = selectedLead?.universityId ? universities.find((u) => u.id === selectedLead.universityId) : undefined;
  const checkedInByName = selected?.checkedInBy ? staff.find((s) => s.id === selected.checkedInBy)?.name : undefined;
  const selectedTicket = selected?.ticketTypeId ? ticketTypes.find((t) => t.id === selected.ticketTypeId) : undefined;
  const showTicketColumn = ticketTypes.length > 0;

  return (
    <div>
      <RegistrationSettingsCard event={event} />
      <div className="grid grid-cols-2 gap-4 mb-5">
        <button
          type="button"
          onClick={() => setView("registrations")}
          className={`text-left p-4 rounded-2xl border shadow-sm transition-colors ${
            view === "registrations" ? "bg-brand-600/5 border-brand-600" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} className={view === "registrations" ? "text-brand-600" : "text-slate-400"} />
            <span className={`text-xs font-medium ${view === "registrations" ? "text-brand-700" : "text-slate-500"}`}>Registrations</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{registrations.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setView("participants")}
          className={`text-left p-4 rounded-2xl border shadow-sm transition-colors ${
            view === "participants" ? "bg-brand-600/5 border-brand-600" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <UserCheck size={15} className={view === "participants" ? "text-brand-600" : "text-slate-400"} />
            <span className={`text-xs font-medium ${view === "participants" ? "text-brand-700" : "text-slate-500"}`}>Participants</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {participants.length} <span className="text-sm font-normal text-slate-400">({conversion}% of registrations)</span>
          </p>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">{view === "registrations" ? "Event registrations" : "Event participants"}</h2>
            <p className="text-xs text-slate-500">
              {shown.length} {view === "registrations" ? "registrant" : "participant"}
              {shown.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resendAll}
              disabled={resendingAll}
              title="Resend the confirmation email (with QR code) to every registrant — good for a reminder a few days before the event"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Send size={12} />
              {resendingAll ? "Sending…" : "Resend QR Codes"}
            </button>
            <button
              onClick={() => {
                downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_${view}.csv`, registrationsToCsv(shown, event));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Download size={12} />
              Export
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {[
                  "Reference ID",
                  "Name",
                  "Email",
                  "Phone",
                  ...(showTicketColumn ? ["Ticket"] : []),
                  ...customFields.map((f) => f.label || "Untitled"),
                  "Status",
                  "Checked In",
                  "Registered",
                ].map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setSelectedId(r.id)} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.referenceId}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{r.fullName}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">{r.email}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.phone || "—"}</td>
                  {showTicketColumn && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const ticket = r.ticketTypeId ? ticketTypes.find((t) => t.id === r.ticketTypeId) : undefined;
                        if (!ticket) return <span className="text-slate-400">—</span>;
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-slate-700">{ticket.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ticket.priceNaira > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                              {ticket.priceNaira > 0 ? formatNaira(ticket.priceNaira) : "Free"}
                            </span>
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {customFields.map((f) => {
                    const v = r.customAnswers?.[f.id];
                    return (
                      <td key={f.id} className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                        {Array.isArray(v) ? v.join(", ") : v || "—"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[r.status]}`}>{statusLabels[r.status]}</span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {busyId === r.id ? (
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : r.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => decide(r, "approve")} title="Approve" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                          <Check size={13} />
                        </button>
                        <button type="button" onClick={() => decide(r, "decline")} title="Decline" className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100">
                          <X size={13} />
                        </button>
                      </div>
                    ) : r.status === "waitlisted" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => decide(r, "promote")}
                          title="Promote from waitlist"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-medium"
                        >
                          <ArrowUpCircle size={13} /> Promote
                        </button>
                        <button type="button" onClick={() => decide(r, "decline")} title="Decline" className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <input
                        type="checkbox"
                        checked={r.status === "checked_in"}
                        disabled={r.status === "cancelled" || r.status === "declined"}
                        onChange={() => toggleCheckedIn(r)}
                        title={r.status === "checked_in" ? "Undo check-in" : "Mark as checked in"}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 disabled:opacity-40"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <RegistrantDetailModal
          registration={selected}
          event={event}
          orgSlug={orgSlug}
          lead={selectedLead}
          destination={selectedDest}
          university={selectedUni}
          checkedInByName={checkedInByName}
          ticketType={selectedTicket}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
