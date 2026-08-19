"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, Mail, Paperclip, Search, Users, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { getDestinationById, getUniversityById, useDestinations, useEvents, useLeads, useUniversities } from "@/lib/store";
import { EventRecord, Role } from "@/lib/types";
import { downloadCsv, leadsToCsv } from "@/lib/csv";
import { sortEventsByProximity } from "@/lib/utils";
import { EventLeadsCard } from "@/components/event-leads-card";
import { Reveal } from "@/components/reveal";

const ADMIN_OR_REP: Role[] = ["admin", "rep"];

export default function LeadsPage() {
  const session = useRequireRole(ADMIN_OR_REP);
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

  if (!session) return null;

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
  }

  async function sendEmail() {
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
    } catch {
      setSendError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-slate-900">Leads</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {filtered.length} of {isRep ? leads.filter((l) => l.universityId === session?.universityId).length : leads.length} records
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openEmailModal}
              disabled={filtered.length === 0}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Mail size={14} />
              Email
            </button>
            <button
              onClick={downloadFiltered}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-transform active:scale-[0.97]"
              style={{ background: "#610064" }}
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {!isRep && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                />
              </div>
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] min-w-[150px] bg-white"
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
                    className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white"
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
                    className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white min-w-[160px]"
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
                <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 border border-rose-100">
                  <X size={13} />
                  Clear ({activeFilters})
                </button>
              )}
            </div>
          </div>
        )}

        {isRep && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
            <div className="relative w-full max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads by name, email or phone..."
                className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
              />
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="text-center py-16 text-slate-400">
              <Users size={36} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No leads found</p>
              {activeFilters > 0 && <p className="text-sm mt-1">Try adjusting your filters</p>}
            </div>
          </div>
        ) : (
          groupedEvents.map((ev, i) => (
            <Reveal key={ev.id} index={i}>
              <EventLeadsCard event={ev} leads={filtered.filter((l) => l.eventId === ev.id)} universities={universities} />
            </Reveal>
          ))
        )}

        {emailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-slate-900">Email Leads</h2>
                <button onClick={() => setEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                  Sending <span className="font-semibold text-slate-900">{filtered.length} leads</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Recipient Email</label>
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
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject</label>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
                  <textarea
                    rows={4}
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Attachment</label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    <Paperclip size={14} className="text-slate-400 shrink-0" />
                    leads_export.csv
                    <span className="text-slate-400">— attached automatically</span>
                  </div>
                </div>

                {sendError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {sendError}
                  </div>
                )}
                {sent && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-50 text-teal-700 text-sm">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                    Email sent to {emailTo}.
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={downloadFiltered} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Download CSV only
                  </button>
                  <button
                    type="button"
                    onClick={sendEmail}
                    disabled={!emailTo || sending}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "#610064" }}
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
