"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, Mail, MessageCircle, Plus, Send, Trash2, Upload, Users, X } from "lucide-react";
import { EventGuest, EventRecord, GuestStatus } from "@/lib/types";
import { PersistError, addEventGuest, bulkAddEventGuests, deleteEventGuest, markGuestsInvited, reloadEventGuests } from "@/lib/store";
import { isValidEmail, isValidPhone, normalizePhone, sanitizePhoneInput } from "@/lib/validation";
import { InviteFlyerDesigner } from "@/components/invite-flyer-designer";
import { buildZip } from "@/lib/zip";

const STATUS_STYLE: Record<GuestStatus, string> = {
  pending: "bg-fill text-muted",
  accepted: "bg-teal-500/15 text-teal-300",
  declined: "bg-rose-500/15 text-rose-300",
  maybe: "bg-amber-500/15 text-amber-300",
};
const STATUS_LABEL: Record<GuestStatus, string> = {
  pending: "No response",
  accepted: "Accepted",
  declined: "Declined",
  maybe: "Maybe",
};

const EMPTY_FORM = { fullName: "", email: "", phone: "", plusOnesAllowed: "0" };

/** Parses one guest per line, pasted or CSV-imported: a name, then an email
 *  and/or a phone in any order (and an optional plus-ones number), separated
 *  by commas or tabs (a spreadsheet paste). Deliberately tolerant of ragged
 *  input (a real guest list is rarely a clean CSV) rather than rejecting the
 *  whole batch over one malformed line. A guest needs an email or a phone:
 *  phone-only guests (common for weddings and birthdays) get their invitation
 *  by WhatsApp, and are stored with an empty email. */
export function parseGuestLines(text: string): { fullName: string; email: string; phone?: string; plusOnesAllowed?: number }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
      const fullName = parts.shift() ?? "";
      let email = "";
      let phone: string | undefined;
      let plusOnes = 0;
      for (const p of parts) {
        if (!email && p.includes("@")) email = p;
        else if (!phone && isValidPhone(p)) phone = normalizePhone(p) ?? p;
        else if (/^\d{1,2}$/.test(p)) plusOnes = parseInt(p, 10);
      }
      return { fullName, email, phone, plusOnesAllowed: plusOnes };
    })
    .filter((g) => g.fullName && (isValidEmail(g.email) || Boolean(g.phone)))
    .map((g) => ({ ...g, email: isValidEmail(g.email) ? g.email : "" }));
}

/** wa.me wants the number in international form without the + */
function waNumber(phone: string): string {
  return (normalizePhone(phone) ?? phone).replace(/\D/g, "");
}

export function GuestListTab({ event, orgSlug, guests }: { event: EventRecord; orgSlug: string; guests: EventGuest[] }) {
  const eventId = event.id;
  const inPerson = event.eventFormat !== "virtual";
  const design = event.inviteDesign ?? null;
  // in-person invite-only events: imported guests are confirmed straight away
  // and get their entry QR (migration 0136); virtual events keep the RSVP flow
  const [confirmNow, setConfirmNow] = useState(inPerson);
  const [confirming, setConfirming] = useState(false);
  const [zipping, setZipping] = useState<string | null>(null);
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

  /** Confirms guests: each gets their registration and entry QR (no RSVP). */
  async function confirmGuests(ids: string[], quiet = false) {
    if (ids.length === 0) return;
    setConfirming(true);
    let confirmed = 0;
    let lastError = "";
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/guests/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestIds: ids.slice(i, i + 500) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          lastError = json.error || "Couldn't confirm these guests.";
          break;
        }
        confirmed += json.confirmed ?? 0;
        if (json.error) lastError = json.error;
      }
      await reloadEventGuests(eventId);
      if (lastError) toast.error(lastError);
      else if (!quiet) toast.success(`${confirmed} guest${confirmed === 1 ? "" : "s"} confirmed`);
      setSelected(new Set());
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setConfirming(false);
    }
    return confirmed;
  }

  /** Every confirmed guest's flyer in one zip, for broadcast lists or forwarding. */
  async function downloadAllFlyers() {
    const ready = guests.filter((g) => g.status === "accepted" && g.inviteToken);
    if (ready.length === 0) return;
    const files: { name: string; data: Uint8Array }[] = [];
    const used = new Set<string>();
    try {
      for (let i = 0; i < ready.length; i++) {
        setZipping(`${i + 1} of ${ready.length}`);
        const res = await fetch(`/api/invites/${ready[i].inviteToken}/flyer`);
        if (!res.ok) continue;
        let base = ready[i].fullName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "guest";
        while (used.has(base)) base += "-2";
        used.add(base);
        files.push({ name: `${base}.png`, data: new Uint8Array(await res.arrayBuffer()) });
      }
      if (files.length === 0) throw new Error("No invitations could be made.");
      const url = URL.createObjectURL(buildZip(files));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event.name.replace(/[^a-z0-9]+/gi, "-")}-invitations.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`${files.length} invitation${files.length === 1 ? "" : "s"} downloaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't make the download.");
    } finally {
      setZipping(null);
    }
  }

  function whatsappLink(g: EventGuest): string | null {
    if (!g.phone || !g.inviteToken) return null;
    const first = g.fullName.trim().split(/\s+/)[0] || g.fullName;
    const link = `${window.location.origin}/i/${g.inviteToken}`;
    const text = `Hello ${first}, you're invited to ${event.name}. Here is your personal invitation with your entry QR code, please keep it and show it at the entrance: ${link}`;
    return `https://wa.me/${waNumber(g.phone)}?text=${encodeURIComponent(text)}`;
  }

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim() || (!form.email.trim() && !form.phone.trim())) {
      setFormError("Enter a name, and an email or a phone number.");
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      setFormError("Enter a valid email address, or leave it blank.");
      return;
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      setFormError("Enter a valid phone number, or leave it blank.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const added = await addEventGuest({
        eventId,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() ? normalizePhone(form.phone) ?? form.phone.trim() : undefined,
        plusOnesAllowed: Number(form.plusOnesAllowed) || 0,
      });
      if (confirmNow && inPerson) {
        await confirmGuests([added.id], true);
        toast.success("Guest added and confirmed");
      } else toast.success("Guest added");
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
      setImportError("Paste at least one line as: Name, email or phone");
      return;
    }
    setImportError("");
    setImporting(true);
    try {
      const added = await bulkAddEventGuests(eventId, parsed);
      if (confirmNow && inPerson) {
        const n = await confirmGuests(added.map((g) => g.id), true);
        toast.success(`${parsed.length} guest${parsed.length !== 1 ? "s" : ""} added${n ? `, ${n} confirmed with their QR` : ""}`);
      } else toast.success(`${parsed.length} guest${parsed.length !== 1 ? "s" : ""} added`);
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

  // The API caps a single request at 50 guest IDs (both a schema limit and a
  // cumulative email-volume throttle) — chunk larger sends client-side rather
  // than let a big "invite everyone" click fail outright on a large list.
  const INVITE_BATCH_SIZE = 50;

  async function sendInvites(guestIds: string[]) {
    if (guestIds.length === 0) return;
    setSendingInvites(true);
    let sentCount = 0;
    let totalCount = 0;
    let lastError: string | null = null;
    try {
      for (let i = 0; i < guestIds.length; i += INVITE_BATCH_SIZE) {
        const batch = guestIds.slice(i, i + INVITE_BATCH_SIZE);
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/guests/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestIds: batch }),
        });
        const json = await res.json();
        if (!res.ok) {
          lastError = json.error || "Couldn't send invites.";
          break;
        }
        sentCount += json.sentCount;
        totalCount += json.totalCount;
        markGuestsInvited(batch);
        if (json.error) {
          // Server-side volume throttle kicked in mid-batch — stop sending
          // further batches rather than hammering a limit we know is hit.
          lastError = json.error;
          break;
        }
      }
      if (lastError) toast.error(lastError);
      if (sentCount > 0) {
        toast.success(`Sent ${sentCount} of ${totalCount || guestIds.length} invite${(totalCount || guestIds.length) !== 1 ? "s" : ""}`);
      }
      setSelected(new Set());
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setSendingInvites(false);
    }
  }

  const previewToken = guests.find((g) => g.status === "accepted" && g.inviteToken)?.inviteToken;

  return (
    <div>
      {inPerson && <InviteFlyerDesigner event={event} sampleName={guests[0]?.fullName || "Dolapo Adeyemi"} previewToken={previewToken} />}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Total", value: counts.total },
          { label: inPerson ? "Confirmed" : "Accepted", value: counts.accepted },
          { label: "Maybe", value: counts.maybe },
          { label: "Declined", value: counts.declined },
          { label: "No response", value: counts.pending },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface rounded-xl border border-line p-3.5">
            <p className="text-xs text-muted mb-1">{stat.label}</p>
            <p className="text-xl font-semibold text-fg">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted">
          {guests.length} guest{guests.length !== 1 ? "s" : ""}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button data-edit
              onClick={() => sendInvites([...selected])}
              disabled={sendingInvites}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
            >
              <Send size={14} />
              {sendingInvites ? "Sending…" : `Invite ${selected.size}`}
            </button>
          )}
          {selected.size > 0 && inPerson && guests.some((g) => selected.has(g.id) && g.status !== "accepted") && (
            <button data-edit
              onClick={() => confirmGuests(guests.filter((g) => selected.has(g.id) && g.status !== "accepted").map((g) => g.id))}
              disabled={confirming}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-line text-fg-2 hover:bg-canvas disabled:opacity-60"
            >
              <CheckCircle2 size={14} />
              {confirming ? "Confirming…" : "Confirm selected"}
            </button>
          )}
          {selected.size === 0 && guests.some((g) => !g.invitedAt && g.email && (g.status === "pending" || g.status === "accepted")) && (
            <button data-edit
              onClick={() => sendInvites(guests.filter((g) => !g.invitedAt && g.email && (g.status === "pending" || g.status === "accepted")).map((g) => g.id))}
              disabled={sendingInvites}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-line text-fg-2 hover:bg-canvas disabled:opacity-60"
            >
              <Mail size={14} />
              {sendingInvites ? "Sending…" : "Email everyone not yet invited"}
            </button>
          )}
          {design && counts.accepted > 0 && (
            <button
              onClick={downloadAllFlyers}
              disabled={zipping !== null}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-line text-fg-2 hover:bg-canvas disabled:opacity-60"
            >
              <Download size={14} />
              {zipping ? `Making ${zipping}…` : "Download all invitations"}
            </button>
          )}
          <button data-edit
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-line text-fg-2 hover:bg-canvas"
          >
            <Upload size={14} />
            Bulk add
          </button>
          <button data-edit
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
          >
            <Plus size={14} />
            Add Guest
          </button>
        </div>
      </div>

      {guests.length === 0 ? (
        <div className="text-center py-16 text-subtle bg-canvas rounded-xl border border-line">
          <Users size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No guests yet — add your list to start sending invites.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left text-xs text-subtle uppercase tracking-wide">
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
                <tr key={g.id} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelected(g.id)} className="w-4 h-4 rounded border-line-strong text-brand-500" />
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-fg">{g.fullName}</p>
                    <p className="text-xs text-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[g.status]}`}>
                      {g.status === "accepted" && inPerson ? "Confirmed" : STATUS_LABEL[g.status]}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-fg-3">
                    {g.plusOnesConfirmed != null ? `${g.plusOnesConfirmed} confirmed` : g.plusOnesAllowed > 0 ? `up to ${g.plusOnesAllowed}` : "—"}
                  </td>
                  <td className="px-2 py-3 text-muted text-xs">{g.invitedAt ? new Date(g.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Not yet"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {design && g.status === "accepted" && g.inviteToken && (
                        <>
                          {whatsappLink(g) && (
                            <a
                              data-edit
                              href={whatsappLink(g)!}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => markGuestsInvited([g.id])}
                              title="Open WhatsApp with their invitation link"
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:underline"
                            >
                              <MessageCircle size={13} aria-hidden="true" /> WhatsApp
                            </a>
                          )}
                          <a href={`/api/invites/${g.inviteToken}/flyer?download=1`} title="Download their invitation" className="inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:underline">
                            <Download size={13} aria-hidden="true" /> Flyer
                          </a>
                        </>
                      )}
                      {g.email && (
                        <button data-edit onClick={() => sendInvites([g.id])} disabled={sendingInvites} className="text-xs font-medium text-brand-500 hover:underline disabled:opacity-50">
                          {g.invitedAt ? "Resend" : g.status === "accepted" && design ? "Email" : "Invite"}
                        </button>
                      )}
                      <button data-edit onClick={() => handleDelete(g.id)} disabled={busyId === g.id} className="text-subtle hover:text-rose-300 disabled:opacity-50">
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
          <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-line-soft">
              <h3 className="font-semibold text-fg">Add Guest</h3>
              <button onClick={() => setShowForm(false)} className="text-subtle hover:text-fg-3">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddGuest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Full name</label>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Email (or a phone below)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Phone (optional)</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: sanitizePhoneInput(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Plus-ones allowed</label>
                  <input
                    type="number"
                    min={0}
                    value={form.plusOnesAllowed}
                    onChange={(e) => setForm((f) => ({ ...f, plusOnesAllowed: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
              {inPerson && (
                <label className="flex items-start gap-2 text-xs text-fg-2">
                  <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  Confirm now: they get their entry QR straight away, no RSVP needed
                </label>
              )}
              {formError && <p className="text-sm text-rose-300">{formError}</p>}
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
                {saving ? "Adding…" : "Add Guest"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-line-soft">
              <h3 className="font-semibold text-fg">Bulk Add Guests</h3>
              <button onClick={() => setShowImport(false)} className="text-subtle hover:text-fg-3">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted">One guest per line: Name, then an email and/or a phone. You can paste straight from a spreadsheet.</p>
              <textarea
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"Amaka Obi, amaka@example.com\nTunde Bello, 0803 000 0000\nDolapo Ade, dolapo@example.com, 0812 000 0000"}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              {inPerson && (
                <label className="flex items-start gap-2 text-xs text-fg-2">
                  <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  Confirm everyone now: each guest gets their entry QR straight away, no RSVP needed
                </label>
              )}
              {importText.trim() && <p className="text-xs text-subtle">{`${parseGuestLines(importText).length} guest${parseGuestLines(importText).length === 1 ? "" : "s"} recognised`}</p>}
              {importError && <p className="text-sm text-rose-300">{importError}</p>}
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
