"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, Send, Trash2, Upload, Users, X } from "lucide-react";
import { EventGuest, GuestStatus } from "@/lib/types";
import { PersistError, addEventGuest, bulkAddEventGuests, deleteEventGuest, markGuestsInvited } from "@/lib/store";

const STATUS_STYLE: Record<GuestStatus, string> = {
  pending: "bg-slate-100 text-slate-500",
  accepted: "bg-teal-100 text-teal-700",
  declined: "bg-rose-100 text-rose-600",
  maybe: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL: Record<GuestStatus, string> = {
  pending: "No response",
  accepted: "Accepted",
  declined: "Declined",
  maybe: "Maybe",
};

const EMPTY_FORM = { fullName: "", email: "", phone: "", plusOnesAllowed: "0" };

/** Parses one guest per line, pasted or CSV-imported: "Full Name, email[,
 *  phone][, plus-ones allowed]" — deliberately tolerant of ragged input (a
 *  real guest list is rarely a clean CSV) rather than rejecting the whole
 *  batch over one malformed line. */
function parseGuestLines(text: string): { fullName: string; email: string; phone?: string; plusOnesAllowed?: number }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const [fullName, email, phone, plusOnes] = parts;
      const n = plusOnes ? parseInt(plusOnes, 10) : 0;
      return { fullName: fullName || "", email: email || "", phone: phone || undefined, plusOnesAllowed: Number.isFinite(n) && n > 0 ? n : 0 };
    })
    .filter((g) => g.fullName && g.email.includes("@"));
}

export function GuestListTab({ eventId, orgSlug, guests }: { eventId: string; orgSlug: string; guests: EventGuest[] }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendingInvites, setSendingInvites] = useState(false);

  const counts = {
    total: guests.length,
    accepted: guests.filter((g) => g.status === "accepted").length,
    declined: guests.filter((g) => g.status === "declined").length,
    maybe: guests.filter((g) => g.status === "maybe").length,
    pending: guests.filter((g) => g.status === "pending").length,
  };

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      setFormError("Name and email are required.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await addEventGuest({ eventId, fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, plusOnesAllowed: Number(form.plusOnesAllowed) || 0 });
      toast.success("Guest added");
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't add this guest.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    const parsed = parseGuestLines(importText);
    if (parsed.length === 0) {
      setImportError("Paste at least one line as: Name, email");
      return;
    }
    setImportError("");
    setImporting(true);
    try {
      await bulkAddEventGuests(eventId, parsed);
      toast.success(`${parsed.length} guest${parsed.length !== 1 ? "s" : ""} added`);
      setImportText("");
      setShowImport(false);
    } catch (err) {
      setImportError(err instanceof PersistError ? err.message : "Couldn't import this list.");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteEventGuest(id);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't remove this guest.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendInvites(guestIds: string[]) {
    if (guestIds.length === 0) return;
    setSendingInvites(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/guests/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't send invites.");
        return;
      }
      markGuestsInvited(guestIds);
      toast.success(`Sent ${json.sentCount} of ${json.totalCount} invite${json.totalCount !== 1 ? "s" : ""}`);
      setSelected(new Set());
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setSendingInvites(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Total", value: counts.total },
          { label: "Accepted", value: counts.accepted },
          { label: "Maybe", value: counts.maybe },
          { label: "Declined", value: counts.declined },
          { label: "No response", value: counts.pending },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-3.5">
            <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
            <p className="text-xl font-semibold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          {guests.length} guest{guests.length !== 1 ? "s" : ""}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => sendInvites([...selected])}
              disabled={sendingInvites}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
            >
              <Send size={14} />
              {sendingInvites ? "Sending…" : `Invite ${selected.size}`}
            </button>
          )}
          {counts.pending > 0 && selected.size === 0 && (
            <button
              onClick={() => sendInvites(guests.filter((g) => g.status === "pending" && !g.invitedAt).map((g) => g.id))}
              disabled={sendingInvites}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Mail size={14} />
              Invite everyone not yet invited
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Upload size={14} />
            Bulk add
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
          >
            <Plus size={14} />
            Add Guest
          </button>
        </div>
      </div>

      {guests.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
          <Users size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No guests yet — add your list to start sending invites.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-2 py-2.5">Guest</th>
                <th className="px-2 py-2.5">Status</th>
                <th className="px-2 py-2.5">Plus-ones</th>
                <th className="px-2 py-2.5">Invited</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelected(g.id)} className="w-4 h-4 rounded border-slate-300 text-brand-600" />
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-slate-900">{g.fullName}</p>
                    <p className="text-xs text-slate-500">{g.email}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[g.status]}`}>{STATUS_LABEL[g.status]}</span>
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {g.plusOnesConfirmed != null ? `${g.plusOnesConfirmed} confirmed` : g.plusOnesAllowed > 0 ? `up to ${g.plusOnesAllowed}` : "—"}
                  </td>
                  <td className="px-2 py-3 text-slate-500 text-xs">{g.invitedAt ? new Date(g.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Not yet"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => sendInvites([g.id])} disabled={sendingInvites} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
                        {g.invitedAt ? "Resend" : "Invite"}
                      </button>
                      <button onClick={() => handleDelete(g.id)} disabled={busyId === g.id} className="text-slate-400 hover:text-rose-600 disabled:opacity-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Guest</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddGuest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Full name</label>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Phone (optional)</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Plus-ones allowed</label>
                  <input
                    type="number"
                    min={0}
                    value={form.plusOnesAllowed}
                    onChange={(e) => setForm((f) => ({ ...f, plusOnesAllowed: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-rose-600">{formError}</p>}
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
                {saving ? "Adding…" : "Add Guest"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Bulk Add Guests</h3>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">One guest per line: Name, email, phone (optional), plus-ones (optional)</p>
              <textarea
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"Amaka Obi, amaka@example.com\nTunde Bello, tunde@example.com, +234 800 000 0000, 1"}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              {importError && <p className="text-sm text-rose-600">{importError}</p>}
              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
              >
                {importing ? "Adding…" : "Add Guests"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
