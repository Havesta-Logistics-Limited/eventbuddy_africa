"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, Loader2, Mail, Paperclip, Search, Users, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { getDestinationById, getUniversityById, useDataReady, useDestinations, useEvents, useLeads, useUniversities } from "@/lib/store";
import { EventRecord, Role } from "@/lib/types";
import { downloadCsv, leadsToCsv } from "@/lib/csv";
import { sortEventsByProximity } from "@/lib/utils";
import { EventLeadsCard } from "@/components/event-leads-card";
import { Reveal } from "@/components/reveal";
import { RowSkeleton } from "@/components/skeleton";
import { AuthLoading } from "@/components/auth-loading";
import { isValidEmail } from "@/lib/validation";

const ADMIN_OR_REP: Role[] = ["admin", "rep"];

export default function LeadsPage() {
  const session = useRequireRole(ADMIN_OR_REP);
  const dataReady = useDataReady();
  const leads = useLeads();
  const events = useEvents();
  const destinations = useDestinations();
  const universities = useUniversities();

  const isRep = session?.role === "rep";

  const [filterEvent, setFilterEvent] = useState(isRep ? session?.eventId || "" : "");
  const [filterDest, setFilterDest] = useState(isRep ? session?.destinationId || "" : "");
  const [filterUni, setFilterUni] = useState(isRep ? session?.universityId || "" : "");
  const [search, setSearch] = useState("");
  const [emailModal, setEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  if (!session) return <AuthLoading />;

  const availableUnis = filterDest ? universities.filter((u) => u.destinationId === filterDest) : universities;

  const filtered = leads.filter((l) => {
    if (filterEvent && l.eventId !== filterEvent) return false;
    if (filterDest && l.destinationId !== filterDest) return false;
    if (filterUni && l.universityId !== filterUni) return false;
    if (isRep && l.universityId !== session?.universityId) return false;
    if (search) {
      const q = search.toLowerCase();
      const full = `${l.firstName} ${l.lastName} ${l.email} ${l.phone}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setFilterEvent("");
    setFilterDest("");
    setFilterUni("");
    setSearch("");
  };

  const activeFilters = [filterEvent, filterDest, filterUni, search].filter(Boolean).length;

  const filteredEventIds = new Set(filtered.map((l) => l.eventId));
  const groupedEvents = sortEventsByProximity(events.filter((ev) => filteredEventIds.has(ev.id)) as EventRecord[]);

  function openEmailModal() {
    const destName = filterDest ? getDestinationById(filterDest)?.name : "";
    const uniName = filterUni ? getUniversityById(filterUni)?.name : "";
    setEmailSubject(`Attendee leads${uniName ? ` — ${uniName}` : ""}`);
    setEmailMessage(
      `Hi,\n\nAttached is a manifest of ${filtered.length} lead${filtered.length !== 1 ? "s" : ""}${uniName ? ` for ${uniName}` : destName ? ` from ${destName}` : ""}.\n\nBest,\n`
    );
    setEmailTo("");
    setSendError("");
    setSent(false);
    setEmailModal(true);
  }

  function downloadFiltered() {
    downloadCsv("leads_export.csv", leadsToCsv(filtered, { includeEvent: true }));
    toast.success(`${filtered.length} lead${filtered.length !== 1 ? "s" : ""} exported`);
  }

  async function sendEmail() {
    if (!isValidEmail(emailTo)) {
      setSendError("Enter a valid email address.");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/send-lead-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          message: emailMessage,
          csv: leadsToCsv(filtered, { includeEvent: true }),
          filename: "leads_export.csv",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "Failed to send email.");
        return;
      }
      setSent(true);
      toast.success("Email sent");
    } catch {
      setSendError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl text-fg">Leads</h1>
            <p className="text-muted text-sm mt-0.5 tabular-nums">
              {filtered.length} of {isRep ? leads.filter((l) => l.universityId === session?.universityId).length : leads.length} records
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openEmailModal}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-line text-fg-3 hover:bg-canvas disabled:opacity-50"
            >
              <Mail size={14} />
              Email
            </button>
            <button
              onClick={downloadFiltered}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-[transform,background-color] active:scale-[0.97]"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {!isRep && (
          <div className="rounded-xl bg-canvas p-4 mb-5">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 min-w-[150px] bg-surface"
              >
                <option value="">All Events</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name.split("—")[0].trim()}
                  </option>
                ))}
              </select>
              {destinations.length > 0 && (
                <>
                  <select
                    value={filterDest}
                    onChange={(e) => {
                      setFilterDest(e.target.value);
                      setFilterUni("");
                    }}
                    className="px-3.5 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-surface"
                  >
                    <option value="">All Destinations</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterUni}
                    onChange={(e) => setFilterUni(e.target.value)}
                    className="px-3.5 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-surface min-w-[160px]"
                  >
                    <option value="">All Universities</option>
                    {availableUnis.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.shortName}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {activeFilters > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10 border border-rose-500/20">
                  <X size={13} />
                  Clear ({activeFilters})
                </button>
              )}
            </div>
          </div>
        )}

        {isRep && (
          <div className="rounded-xl bg-canvas p-4 mb-5">
            <div className="relative w-full max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads by name, email or phone..."
                className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>
        )}

        {!dataReady ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="text-center py-16 text-subtle">
              <Users size={36} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No leads found</p>
              {activeFilters > 0 && <p className="text-sm mt-1">Try adjusting your filters</p>}
            </div>
          </div>
        ) : (
          groupedEvents.map((ev, i) => (
            <Reveal key={ev.id} index={i}>
              <EventLeadsCard event={ev} leads={filtered.filter((l) => l.eventId === ev.id)} universities={universities} orgSlug={session?.orgSlug} />
            </Reveal>
          ))
        )}

        {emailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
            <div className="bg-surface rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-fg">Email Leads</h2>
                <button onClick={() => setEmailModal(false)} className="text-subtle hover:text-fg-3">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div className="p-3 bg-canvas rounded-lg text-sm text-fg-3">
                  Sending <span className="font-semibold text-fg">{filtered.length} leads</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Recipient Email</label>
                  <input
                    type="email"
                    required
                    value={emailTo}
                    onChange={(e) => {
                      setEmailTo(e.target.value);
                      setSent(false);
                      setSendError("");
                    }}
                    placeholder="recipient@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Subject</label>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Message</label>
                  <textarea
                    rows={4}
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Attachment</label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-line bg-canvas text-sm text-fg-3">
                    <Paperclip size={14} className="text-subtle shrink-0" />
                    leads_export.csv
                    <span className="text-subtle">— attached automatically</span>
                  </div>
                </div>

                {sendError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {sendError}
                  </div>
                )}
                {sent && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-500/10 text-teal-300 text-sm">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                    Email sent to {emailTo}.
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={downloadFiltered} className="flex-1 py-2.5 rounded-lg border border-line text-sm font-medium text-fg-3 hover:bg-canvas">
                    Download CSV only
                  </button>
                  <button
                    type="button"
                    onClick={sendEmail}
                    disabled={!emailTo || sending}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {sending && <Loader2 size={14} className="animate-spin" />}
                    {sending ? "Sending…" : "Send Email"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
