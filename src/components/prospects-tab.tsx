"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, UserCheck, Download, Loader2, Send, Check, X, ArrowUpCircle, ClipboardCheck, ListOrdered, Search, ChevronLeft, ChevronRight } from "lucide-react";
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
    <div className="mb-5 p-4 rounded-xl border border-line bg-canvas space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck size={16} className="text-subtle shrink-0" />
          <div>
            <p className="text-sm font-medium text-fg">Require approval</p>
            <p className="text-xs text-muted">New registrations start pending — review and approve or decline each one.</p>
          </div>
        </div>
        <button
          data-edit
          type="button"
          role="switch"
          aria-checked={!!event.requiresApproval}
          onClick={() => toggle("requiresApproval", event.requiresApproval, setTogglingApproval)}
          disabled={togglingApproval}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${event.requiresApproval ? "bg-brand-600" : "bg-fill-max"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface transition-transform ${event.requiresApproval ? "translate-x-4" : ""}`} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
        <div className="flex items-center gap-2.5">
          <ListOrdered size={16} className="text-subtle shrink-0" />
          <div>
            <p className="text-sm font-medium text-fg">Waitlist when sold out</p>
            <p className="text-xs text-muted">Once a capacity-limited ticket sells out, new sign-ups join a waitlist instead of being turned away.</p>
          </div>
        </div>
        <button
          data-edit
          type="button"
          role="switch"
          aria-checked={!!event.waitlistEnabled}
          onClick={() => toggle("waitlistEnabled", event.waitlistEnabled, setTogglingWaitlist)}
          disabled={togglingWaitlist}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${event.waitlistEnabled ? "bg-brand-600" : "bg-fill-max"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface transition-transform ${event.waitlistEnabled ? "translate-x-4" : ""}`} />
        </button>
      </div>
    </div>
  );
}

export const statusStyles: Record<RegistrationRecord["status"], string> = {
  registered: "bg-amber-500/15 text-amber-300",
  checked_in: "bg-teal-500/15 text-teal-300",
  cancelled: "bg-fill text-muted",
  pending: "bg-orange-500/15 text-orange-300",
  waitlisted: "bg-violet-500/15 text-violet-300",
  declined: "bg-rose-500/15 text-rose-300",
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
const PAGE_SIZE = 25;

/** Digits of a phone number in +234 form, so 0803…, 803…, +234 803… all match. */
function phoneDigits(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.startsWith("234")) return d;
  if (d.startsWith("0")) return "234" + d.slice(1);
  return d;
}

/** The table's search (name, email, phone, reference) and filters. */
export function filterRegistrations(
  rows: RegistrationRecord[],
  query: string,
  status: "all" | "checked_in" | "not_checked_in" | "pending" | "cancelled",
  ticketTypeId: string
): RegistrationRecord[] {
  const q = query.trim().toLowerCase();
  const qRef = q.replace(/[^a-z0-9]/g, "");
  const qPhone = /\d{3,}/.test(q) ? phoneDigits(q) : "";
  return rows.filter((r) => {
    if (status === "checked_in" && r.status !== "checked_in") return false;
    if (status === "not_checked_in" && r.status !== "registered") return false;
    if (status === "pending" && r.status !== "pending" && r.status !== "waitlisted") return false;
    if (status === "cancelled" && r.status !== "cancelled" && r.status !== "declined") return false;
    if (ticketTypeId !== "all" && r.ticketTypeId !== ticketTypeId) return false;
    if (!q) return true;
    if (r.fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) return true;
    if (qRef.length >= 3 && r.referenceId.toLowerCase().replace(/[^a-z0-9]/g, "").includes(qRef)) return true;
    if (qPhone && r.phone && phoneDigits(r.phone).includes(qPhone.replace(/^234/, ""))) return true;
    return false;
  });
}

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
  // search, filters and paging for the table
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "checked_in" | "not_checked_in" | "pending" | "cancelled">("all");
  const [ticketFilter, setTicketFilter] = useState("all");
  const [page, setPage] = useState(0);
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
        <div className="bg-canvas border border-line rounded-xl p-10 text-center">
          <Users size={28} className="mx-auto mb-3 text-faint" />
          <p className="font-medium text-muted">No registrations yet</p>
          <p className="text-xs text-subtle mt-1.5">Self-service sign-ups for this event will appear here.</p>
        </div>
      </div>
    );
  }

  const participants = registrations.filter((r) => r.status === "checked_in");
  const conversion = registrations.length === 0 ? 0 : Math.round((participants.length / registrations.length) * 100);
  const shown = view === "registrations" ? registrations : participants;
  const filtered = filterRegistrations(shown, query, statusFilter, ticketFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const isFiltering = query.trim() !== "" || statusFilter !== "all" || ticketFilter !== "all";

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
            view === "registrations" ? "bg-brand-600/5 border-brand-600" : "bg-surface border-line hover:border-line-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} className={view === "registrations" ? "text-brand-500" : "text-subtle"} />
            <span className={`text-xs font-medium ${view === "registrations" ? "text-brand-500" : "text-muted"}`}>Registrations</span>
          </div>
          <p className="text-2xl font-bold text-fg tabular-nums">{registrations.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setView("participants")}
          className={`text-left p-4 rounded-2xl border shadow-sm transition-colors ${
            view === "participants" ? "bg-brand-600/5 border-brand-600" : "bg-surface border-line hover:border-line-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <UserCheck size={15} className={view === "participants" ? "text-brand-500" : "text-subtle"} />
            <span className={`text-xs font-medium ${view === "participants" ? "text-brand-500" : "text-muted"}`}>Participants</span>
          </div>
          <p className="text-2xl font-bold text-fg tabular-nums">
            {participants.length} <span className="text-sm font-normal text-subtle">({conversion}% of registrations)</span>
          </p>
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line-soft">
          <div>
            <h2 className="font-semibold text-fg">{view === "registrations" ? "Event registrations" : "Event participants"}</h2>
            <p className="text-xs text-muted">
              {isFiltering ? `${filtered.length} of ${shown.length} ` : `${shown.length} `}
              {view === "registrations" ? "registrant" : "participant"}
              {shown.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-edit
              onClick={resendAll}
              disabled={resendingAll}
              title="Resend the confirmation email (with QR code) to every registrant — good for a reminder a few days before the event"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line text-fg-3 hover:bg-canvas disabled:opacity-50"
            >
              <Send size={12} />
              {resendingAll ? "Sending…" : "Resend QR Codes"}
            </button>
            <button
              onClick={() => {
                downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_${view}.csv`, registrationsToCsv(filtered, event));
              }}
              title={isFiltering ? "Exports the rows matching your search and filters" : "Exports every row"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line text-fg-3 hover:bg-canvas"
            >
              <Download size={12} />
              {isFiltering ? `Export ${filtered.length}` : "Export"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-6 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, email, phone or reference"
              aria-label="Search registrations"
              className="eb-input pl-9!"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(0);
            }}
            aria-label="Filter by status"
            className="eb-input w-auto!"
          >
            <option value="all">All statuses</option>
            <option value="checked_in">Checked in</option>
            <option value="not_checked_in">Not checked in yet</option>
            <option value="pending">Pending / waitlisted</option>
            <option value="cancelled">Cancelled / declined</option>
          </select>
          {ticketTypes.length > 1 && (
            <select
              value={ticketFilter}
              onChange={(e) => {
                setTicketFilter(e.target.value);
                setPage(0);
              }}
              aria-label="Filter by ticket"
              className="eb-input w-auto!"
            >
              <option value="all">All tickets</option>
              {ticketTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas">
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
                  <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={99} className="px-4 py-10 text-center text-sm text-muted">
                    {isFiltering ? "No one matches your search or filters." : "No registrations yet."}
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.id} onClick={() => setSelectedId(r.id)} className="hover:bg-canvas cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs text-fg-3 whitespace-nowrap">{r.referenceId}</td>
                  <td className="px-4 py-3 font-medium text-fg whitespace-nowrap">
                    {r.fullName}
                    {r.source === "kiosk" && (
                      <span className="eb-walkup-badge ml-2" title="Registered at the door from the staff Kiosk">
                        Walk-up
                      </span>
                    )}
                    {r.source === "exhibitor" && (
                      <span className="eb-walkup-badge eb-walkup-badge--exhibitor ml-2" title={`Staff pass for ${String(r.customAnswers?.company ?? "an exhibitor")}`}>
                        Exhibitor
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted max-w-[180px] truncate">{r.email}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{r.phone || "—"}</td>
                  {showTicketColumn && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const ticket = r.ticketTypeId ? ticketTypes.find((t) => t.id === r.ticketTypeId) : undefined;
                        if (!ticket) return <span className="text-subtle">—</span>;
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-fg-2">{ticket.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ticket.priceNaira > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-fill text-fg-2"}`}>
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
                      <td key={f.id} className="px-4 py-3 text-fg-3 max-w-[160px] truncate">
                        {Array.isArray(v) ? v.join(", ") : v || "—"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[r.status]}`}>{statusLabels[r.status]}</span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {busyId === r.id ? (
                      <Loader2 size={16} className="animate-spin text-subtle" />
                    ) : r.status === "pending" ? (
                      <div data-edit className="flex items-center gap-1.5">
                        <button type="button" onClick={() => decide(r, "approve")} title="Approve" className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15">
                          <Check size={13} />
                        </button>
                        <button type="button" onClick={() => decide(r, "decline")} title="Decline" className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/15">
                          <X size={13} />
                        </button>
                      </div>
                    ) : r.status === "waitlisted" ? (
                      <div data-edit className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => decide(r, "promote")}
                          title="Promote from waitlist"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/15 text-xs font-medium"
                        >
                          <ArrowUpCircle size={13} /> Promote
                        </button>
                        <button type="button" onClick={() => decide(r, "decline")} title="Decline" className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/15">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <input
                        data-edit
                        type="checkbox"
                        checked={r.status === "checked_in"}
                        disabled={r.status === "cancelled" || r.status === "declined"}
                        onChange={() => toggleCheckedIn(r)}
                        title={r.status === "checked_in" ? "Undo check-in" : "Mark as checked in"}
                        className="w-4 h-4 rounded border-line-strong text-brand-500 focus:ring-brand-600 disabled:opacity-40"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-subtle whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-6 py-3 text-xs text-muted">
            <span>{`Showing ${safePage * PAGE_SIZE + 1}–${Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of ${filtered.length}`}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 font-medium text-fg-3 hover:bg-canvas disabled:opacity-40"
              >
                <ChevronLeft size={13} aria-hidden="true" /> Previous
              </button>
              <span className="px-1.5 tabular-nums">{`Page ${safePage + 1} of ${pageCount}`}</span>
              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 font-medium text-fg-3 hover:bg-canvas disabled:opacity-40"
              >
                Next <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
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
