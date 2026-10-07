"use client";

import { useEffect, useState } from "react";
import { AlertCircle, QrCode, UserPlus } from "lucide-react";
import { brandedQrDataUrl } from "@/lib/branded-qr";
import { isValidEmail, sanitizePhoneInput } from "@/lib/validation";

type KioskInfo = {
  virtual: boolean;
  freeRegistration: boolean;
  freeTickets: { id: string; name: string; left: number | null }[];
  sellsPaid: boolean;
  buyUrl: string;
};

export type WalkupResult = { outcome: "registered" | "existing" | "already"; fullName: string; referenceId?: string; checkedInAt?: string; emailSent?: boolean };

/**
 * Kiosk → Register walk-up. Free events: a short form that registers the
 * attendee and checks them in at once (no second scan). Paid events: a large
 * QR the walk-up scans with their own phone to buy a ticket, after which
 * staff scan their ticket in the Scan tab. Mixed events get both.
 */
export function KioskRegister({
  staffId,
  onResult,
  onError,
}: {
  staffId: string;
  onResult: (r: WalkupResult) => void;
  onError: (message: string) => void;
}) {
  const [info, setInfo] = useState<KioskInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [buyQr, setBuyQr] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", ticketTypeId: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/kiosk/register?staffId=${encodeURIComponent(staffId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) return setLoadError(json.error);
        setInfo(json);
        if (json.freeTickets?.length) setForm((f) => ({ ...f, ticketTypeId: json.freeTickets[0].id }));
        if (json.sellsPaid && json.buyUrl) brandedQrDataUrl(json.buyUrl, { width: 640, margin: 1 }).then(setBuyQr).catch(() => {});
      })
      .catch(() => setLoadError("Couldn't load this event's tickets. Check your connection."));
  }, [staffId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter their first and last name.");
    if (!isValidEmail(form.email.trim())) return setError("Enter a valid email so they get their ticket.");
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/kiosk/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, ...form, ticketTypeId: form.ticketTypeId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't register this attendee.");
        onError(json.error || "Couldn't register this attendee.");
        return;
      }
      onResult({ outcome: json.outcome, fullName: json.registration.fullName, referenceId: json.registration.referenceId, checkedInAt: json.registration.checkedInAt, emailSent: json.emailSent });
      setForm((f) => ({ firstName: "", lastName: "", email: "", phone: "", ticketTypeId: f.ticketTypeId }));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="eb-alert" role="alert">
        <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {loadError}
      </div>
    );
  }
  if (!info) return <div className="eb-card p-8 text-center text-sm text-muted">Loading…</div>;
  if (info.virtual) return <div className="eb-card p-8 text-center text-sm text-muted">Virtual events don&apos;t have door registration.</div>;

  return (
    <div className={`grid gap-4 ${info.freeRegistration && info.sellsPaid ? "lg:grid-cols-[1.2fr_1fr]" : ""}`}>
      {info.freeRegistration && (
        <form onSubmit={submit} className="eb-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <UserPlus size={20} className="text-[var(--pt-a)]" aria-hidden="true" /> Register a walk-up
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">They&apos;re checked in straight away and get their ticket QR by email.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="wk-first" className="eb-label eb-req">First name</label>
              <input id="wk-first" className="eb-input" autoComplete="off" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wk-last" className="eb-label eb-req">Last name</label>
              <input id="wk-last" className="eb-input" autoComplete="off" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wk-email" className="eb-label eb-req">Email</label>
              <input id="wk-email" type="email" inputMode="email" className="eb-input" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="wk-phone" className="eb-label">Phone</label>
              <input id="wk-phone" type="tel" className="eb-input" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: sanitizePhoneInput(e.target.value) })} placeholder="0801 234 5678" />
            </div>
            {info.freeTickets.length > 1 && (
              <div className="sm:col-span-2">
                <label htmlFor="wk-ticket" className="eb-label">Ticket</label>
                <select id="wk-ticket" className="eb-input" value={form.ticketTypeId} onChange={(e) => setForm({ ...form, ticketTypeId: e.target.value })}>
                  {info.freeTickets.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.left === 0}>
                      {t.name}
                      {t.left != null ? ` (${t.left} left)` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {error && (
            <p className="eb-alert mt-4" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          <button type="submit" disabled={saving} className="eb-portal-cta mt-5">
            {saving ? "Registering…" : "Register & check in"}
          </button>
        </form>
      )}

      {info.sellsPaid && (
        <div className="eb-card items-center p-5 text-center sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <QrCode size={20} className="text-[var(--pt-a)]" aria-hidden="true" /> Buy at the door
          </h2>
          <p className="mt-1 mb-4 max-w-sm text-sm text-muted">
            Ask the walk-up to scan this with their phone camera, buy a ticket, then show you their ticket QR in the Scan tab.
          </p>
          {buyQr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={buyQr} alt="QR code to buy a ticket for this event" className="eb-light w-full max-w-[300px] rounded-2xl p-3" />
          ) : (
            <div className="grid aspect-square w-full max-w-[300px] place-items-center rounded-2xl bg-fill text-sm text-muted">Making QR…</div>
          )}
          <p className="mt-3 max-w-xs break-all text-xs text-subtle">{info.buyUrl}</p>
        </div>
      )}
    </div>
  );
}
