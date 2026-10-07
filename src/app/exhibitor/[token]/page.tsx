"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, BadgeCheck, CalendarDays, Download, Flame, IdCard, ImagePlus, Mail, MapPin, Phone, ScanLine, Snowflake, Store, Sun, Trash2, Users } from "lucide-react";
import { compressImageFile } from "@/lib/utils";
import { ExhibitorTile } from "@/components/exhibitor-tile";
import { toast } from "sonner";
import { FastScanStage, type ScanFlash } from "@/components/fast-scan-stage";
import { playScanFeedback } from "@/lib/scan-feedback";
import { csvEscape, downloadCsv } from "@/lib/csv";

type Portal = {
  status: "applied" | "approved" | "declined" | "paid" | "cancelled";
  company: string;
  contact: string;
  standName: string;
  standLabel: string | null;
  event: { name: string; date: string; startTime: string | null; venue: string; location: string };
  payUrl?: string | null;
  passesIncluded?: number;
  passes?: { referenceId: string; name: string; email: string; checkedIn: boolean }[];
  leadCount?: number;
  leadsKeptUntil?: string;
  profile?: { logoUrl: string | null; description: string; category: string; website: string; listed: boolean };
};
type Lead = { id: string; name: string; email: string; phone: string | null; rating: "hot" | "warm" | "cold" | null; notes: string; capturedBy?: string | null; capturedAt?: string };
type Tab = "scan" | "leads" | "passes" | "profile";

const RATINGS = [
  { id: "hot", label: "Hot", icon: Flame },
  { id: "warm", label: "Warm", icon: Sun },
  { id: "cold", label: "Cold", icon: Snowflake },
] as const;

const NAME_KEY = "eventbuddy:exhibitor-staff-name";

/**
 * The exhibitor portal (migration 0113), opened from the private link in the
 * "stand confirmed" email. Built for a phone at the stand: scan visitors'
 * tickets to collect leads, rate them and add notes, export them, and name
 * the staff passes that get the team in at the door.
 */
export default function ExhibitorPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [p, setP] = useState<Portal | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("scan");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [current, setCurrent] = useState<Lead | null>(null);
  const [flash, setFlash] = useState<ScanFlash | null>(null);
  const [manual, setManual] = useState("");
  const [staffName, setStaffName] = useState("");
  const [passForm, setPassForm] = useState({ fullName: "", email: "" });
  const [busy, setBusy] = useState(false);
  // shown under the code box too: the camera flash is only visible while the camera is on
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/exhibitor/portal?token=${encodeURIComponent(token)}`);
    const json = await res.json();
    if (!res.ok) return setError(json.error || "This portal link isn't valid.");
    setP(json);
  }, [token]);

  const loadLeads = useCallback(async () => {
    const res = await fetch(`/api/exhibitor/leads?token=${encodeURIComponent(token)}`);
    setLeads(res.ok ? (await res.json()).leads : []);
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
    try {
      setStaffName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* storage unavailable */
    }
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the Leads tab opens
    if (tab === "leads" && p?.status === "paid") loadLeads();
  }, [tab, p?.status, loadLeads]);

  function show(outcome: ScanFlash["outcome"], title: string, message: string, name?: string) {
    playScanFeedback(outcome);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ key: Date.now(), outcome, title, name, message });
    setLastResult({ ok: outcome !== "error", text: `${title}${name ? `: ${name}` : ""}. ${message}` });
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  }

  async function scan(code: string) {
    const res = await fetch("/api/exhibitor/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, code, capturedBy: staffName || undefined }) });
    const json = await res.json();
    if (!res.ok) return show("error", "Not a lead", json.error || "Couldn't read that ticket.");
    setCurrent(json.lead);
    if (json.duplicate) show("already", "Already a lead", "Scanned before. Their details are below.", json.lead.name);
    else {
      show("success", "Lead saved", "Rate them and add a note below.", json.lead.name);
      setP((x) => (x ? { ...x, leadCount: (x.leadCount ?? 0) + 1 } : x));
    }
  }

  async function updateLead(id: string, patch: { rating?: Lead["rating"]; notes?: string }) {
    const res = await fetch("/api/exhibitor/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, leadId: id, ...patch }) });
    if (!res.ok) return toast.error("Couldn't save that. Try again.");
    setCurrent((c) => (c && c.id === id ? { ...c, ...patch } : c));
    setLeads((ls) => ls && ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function addPass(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/exhibitor/passes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...passForm }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error || "Couldn't add the pass.");
    toast.success(json.emailed === false ? "Pass added. We couldn't email it; they can show the code from this page." : "Pass added and emailed with its QR code");
    setPassForm({ fullName: "", email: "" });
    load();
  }

  async function removePass(referenceId: string, name: string) {
    if (!confirm(`Remove ${name}'s pass? Its QR code stops working.`)) return;
    const res = await fetch("/api/exhibitor/passes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, referenceId }) });
    const json = await res.json();
    if (!res.ok) return toast.error(json.error || "Couldn't remove the pass.");
    load();
  }

  function exportCsv() {
    const rows = [["Name", "Email", "Phone", "Rating", "Notes", "Scanned by", "Scanned at"], ...(leads ?? []).map((l) => [l.name, l.email, l.phone ?? "", l.rating ?? "", l.notes, l.capturedBy ?? "", l.capturedAt ? new Date(l.capturedAt).toLocaleString("en-GB") : ""])];
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    downloadCsv(`${p?.company ?? "exhibitor"}_leads.csv`.replace(/[^a-z0-9_.]/gi, "_"), csv);
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
        <div>
          <AlertCircle size={36} className="mx-auto text-rose-300" aria-hidden="true" />
          <p className="mt-3 font-semibold text-fg">{error}</p>
          <p className="mt-1 text-sm text-muted">Use the link from your &ldquo;stand confirmed&rdquo; email, or ask the organizer to resend it.</p>
        </div>
      </div>
    );
  }
  if (!p) return <div className="min-h-screen bg-canvas" />;

  const when = new Date(`${p.event.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="eb-exhibitor-portal min-h-screen bg-canvas text-fg">
      <header className="eb-portal-head border-b border-line-soft">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff8af5]">Exhibitor portal</p>
          <h1 className="mt-1 font-display text-2xl text-white">{p.company}</h1>
          <p className="mt-1 text-sm text-fg-3">
            {p.standName}
            {p.standLabel ? ` · Stand ${p.standLabel}` : ""} at <strong className="text-fg">{p.event.name}</strong>
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" /> {when}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin size={13} aria-hidden="true" /> {[p.event.venue, p.event.location].filter(Boolean).join(", ")}</span>
          </p>
        </div>
      </header>

      {p.status !== "paid" ? (
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="font-semibold text-fg">{p.status === "approved" ? "Pay for your stand to open your portal" : p.status === "applied" ? "Your application is waiting for the organizer" : "This booking is closed"}</p>
          {p.payUrl && (
            <Link href={p.payUrl} className="eb-btn eb-btn--primary mt-5">
              Pay for my stand
            </Link>
          )}
        </main>
      ) : (
        <main className="mx-auto max-w-3xl px-4 pb-20 pt-5">
          <div className="eb-seg mb-5 w-full" role="group" aria-label="Portal sections">
            {([
              ["scan", "Scan", ScanLine],
              ["leads", `Leads\u00a0${p.leadCount ?? 0}`, Users],
              ["passes", `Passes\u00a0${p.passes?.length ?? 0}/${p.passesIncluded ?? 0}`, IdCard],
              ["profile", "Profile", Store],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className="flex-1">
                {/* icons only from sm up: four sections must fit a phone */}
                <Icon size={15} aria-hidden="true" className="hidden sm:inline" /> {label}
              </button>
            ))}
          </div>

          {tab === "scan" && (
            <div className="space-y-4">
              <FastScanStage onScan={scan} flash={flash} cooldownSeconds={2} label="Scanning visitors" startHint="Scan each visitor's ticket QR to save them as a lead." />
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manual.trim()) scan(manual.trim()).then(() => setManual(""));
                }}
              >
                <input className="eb-input min-w-0 flex-1" placeholder="Or type the code on their ticket" aria-label="Ticket code" value={manual} onChange={(e) => setManual(e.target.value)} />
                <button type="submit" className="eb-btn eb-btn--ghost">Add</button>
              </form>
              {lastResult && (
                <p role="status" className={`text-sm ${lastResult.ok ? "text-emerald-300" : "text-rose-300"}`}>
                  {lastResult.text}
                </p>
              )}
              <div>
                <label htmlFor="staff-name" className="eb-label">Your name (shown on leads you scan)</label>
                <input
                  id="staff-name"
                  className="eb-input"
                  maxLength={120}
                  placeholder="e.g. Tolu"
                  value={staffName}
                  onChange={(e) => {
                    setStaffName(e.target.value);
                    try {
                      localStorage.setItem(NAME_KEY, e.target.value);
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              </div>
              {current && <LeadCard lead={current} onUpdate={updateLead} />}
            </div>
          )}

          {tab === "leads" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {leads === null ? "Loading your leads…" : leads.length ? `${leads.length} visitor${leads.length === 1 ? "" : "s"} scanned at your stand` : "No leads yet. Scan visitors' tickets at your stand."}
                </p>
                {!!leads?.length && (
                  <button type="button" onClick={exportCsv} className="eb-btn eb-btn--ghost">
                    <Download size={14} /> Export CSV
                  </button>
                )}
              </div>
              {(leads ?? []).map((l) => (
                <LeadCard key={l.id} lead={l} onUpdate={updateLead} />
              ))}
              {p.leadsKeptUntil && (
                <p className="pt-2 text-center text-xs text-subtle">
                  To protect visitors&apos; privacy, leads are kept until{" "}
                  {new Date(`${p.leadsKeptUntil}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, 90 days after the event. Export them before then.
                </p>
              )}
            </div>
          )}

          {tab === "profile" && p.profile && <ProfileSection token={token} company={p.company} standLabel={p.standLabel} initial={p.profile} onSaved={load} />}

          {tab === "passes" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Your {p.standName} includes {p.passesIncluded} staff pass{p.passesIncluded === 1 ? "" : "es"}. Each person gets their own QR code by email to get in at the door.
              </p>
              <ul className="space-y-2">
                {(p.passes ?? []).map((pass) => (
                  <li key={pass.referenceId} className="eb-ov-row">
                    <BadgeCheck size={18} className={pass.checkedIn ? "text-emerald-300" : "text-subtle"} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-fg">{pass.name}</p>
                      <p className="truncate text-xs text-muted">
                        {pass.email} · <span className="font-mono">{pass.referenceId}</span>
                        {pass.checkedIn ? " · checked in" : ""}
                      </p>
                    </div>
                    {!pass.checkedIn && (
                      <button type="button" className="rounded-lg p-1.5 text-subtle hover:text-rose-300" aria-label={`Remove ${pass.name}'s pass`} onClick={() => removePass(pass.referenceId, pass.name)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {(p.passes?.length ?? 0) < (p.passesIncluded ?? 0) ? (
                <form onSubmit={addPass} className="eb-ov-card grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor="ps-name" className="eb-label eb-req">Full name</label>
                    <input id="ps-name" className="eb-input" maxLength={120} value={passForm.fullName} onChange={(e) => setPassForm({ ...passForm, fullName: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="ps-email" className="eb-label">Email for their QR</label>
                    <input id="ps-email" type="email" className="eb-input" placeholder={`Defaults to ${p.contact}'s`} value={passForm.email} onChange={(e) => setPassForm({ ...passForm, email: e.target.value })} />
                  </div>
                  <button type="submit" disabled={busy || passForm.fullName.trim().length < 2} className="eb-btn eb-btn--primary">
                    {busy ? "Adding…" : "Add pass"}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-subtle">All your passes are named. Remove one to swap someone in, or ask the organizer for more.</p>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function LeadCard({ lead, onUpdate }: { lead: Lead; onUpdate: (id: string, patch: { rating?: Lead["rating"]; notes?: string }) => void }) {
  const [notes, setNotes] = useState(lead.notes);
  return (
    <div className="eb-ov-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{lead.name}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-3">
            <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-fg"><Mail size={13} /> {lead.email}</a>
            {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-fg"><Phone size={13} /> {lead.phone}</a>}
          </p>
          {lead.capturedBy && <p className="mt-1 text-xs text-subtle">Scanned by {lead.capturedBy}</p>}
        </div>
        <div className="eb-seg" role="group" aria-label={`Rate ${lead.name}`}>
          {RATINGS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={lead.rating === id} onClick={() => onUpdate(lead.id, { rating: lead.rating === id ? null : id })}>
              <Icon size={14} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        rows={2}
        className="eb-input mt-3"
        placeholder="Notes: what they're interested in, follow-up…"
        aria-label={`Notes about ${lead.name}`}
        maxLength={2000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== lead.notes && onUpdate(lead.id, { notes })}
      />
    </div>
  );
}

function ProfileSection({
  token,
  company,
  standLabel,
  initial,
  onSaved,
}: {
  token: string;
  company: string;
  standLabel: string | null;
  initial: NonNullable<Portal["profile"]>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [logo, setLogo] = useState<string | null>(initial.logoUrl);
  const [newLogo, setNewLogo] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/exhibitor/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, description: form.description, category: form.category, website: form.website, listed: form.listed, logo: newLogo }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) return toast.error(json.error || "Couldn't save your profile.");
    setNewLogo(undefined);
    toast.success(form.listed ? "Saved. Attendees see you like the preview." : "Saved. You're hidden from the event directory.");
    onSaved();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted">Attendees find you in the event&apos;s exhibitor directory, in their Event Hub and on the event page.</p>
      <label className="flex items-center gap-2.5 text-sm font-medium text-fg">
        <input type="checkbox" className="h-4 w-4" checked={form.listed} onChange={(e) => setForm({ ...form, listed: e.target.checked })} />
        Show {company} in the event directory
      </label>
      <div className="eb-ov-card flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${company} logo`} className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="text-2xl font-bold text-[#1a0b1f]">{company.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="eb-btn eb-btn--ghost cursor-pointer">
            <ImagePlus size={14} aria-hidden="true" /> {logo ? "Change logo" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const dataUrl = await compressImageFile(f, 600, 0.9);
                  setLogo(dataUrl);
                  setNewLogo(dataUrl);
                } catch {
                  toast.error("Couldn't read that image.");
                }
              }}
            />
          </label>
          {logo && (
            <button
              type="button"
              className="eb-btn eb-btn--ghost"
              onClick={() => {
                setLogo(null);
                setNewLogo("");
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-cat" className="eb-label">What you do</label>
          <input id="pf-cat" className="eb-input" maxLength={80} placeholder="Food & drinks" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pf-web" className="eb-label">Website or social page</label>
          <input id="pf-web" className="eb-input" inputMode="url" maxLength={300} placeholder="instagram.com/yourbrand" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor="pf-desc" className="eb-label">About you</label>
        <textarea id="pf-desc" rows={3} className="eb-input" maxLength={2000} placeholder="What visitors will find at your stand" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Preview</p>
        <ExhibitorTile company={company} logoUrl={logo} category={form.category} description={form.description} website={form.website} standLabel={standLabel} />
      </div>
      <button type="submit" disabled={saving} className="eb-btn eb-btn--primary w-full">
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
