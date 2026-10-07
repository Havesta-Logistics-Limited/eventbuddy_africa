"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/copy-text";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Globe, ImagePlus, Mail, Map as MapIcon, Pencil, Phone, Plus, Store, Trash2, X } from "lucide-react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteEventMedia, uploadEventMedia } from "@/lib/supabase/storage";
import { compressImageFile } from "@/lib/utils";
import { FloorPlan } from "@/components/floor-plan";
import { formatNaira } from "@/lib/billing";
import type { EventRecord } from "@/lib/types";
import type { ExhibitorStatus } from "@/lib/exhibitors";

type StandType = { id: string; name: string; description: string | null; price_naira: number; quantity: number | null; passes_included: number };
type Exhibitor = {
  id: string;
  stand_type_id: string | null;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  category: string | null;
  description: string | null;
  status: ExhibitorStatus;
  stand_label: string | null;
  amount_naira: number | null;
  decline_reason: string | null;
  applied_at: string;
  paid_at: string | null;
  portal_token: string;
  map_x: number | null;
  map_y: number | null;
};

// "paid" means confirmed: a paid stand, or a free one once approved (0117)
const STATUS_LABEL: Record<ExhibitorStatus, string> = { applied: "New", approved: "Awaiting payment", paid: "Confirmed", declined: "Declined", cancelled: "Cancelled" };
const FILTERS: { id: "all" | ExhibitorStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "applied", label: "New" },
  { id: "approved", label: "Awaiting payment" },
  { id: "paid", label: "Confirmed" },
  { id: "declined", label: "Declined" },
];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json } as { ok: boolean; error?: string; emailed?: boolean };
}

/**
 * Event page → Exhibitors (migration 0112): take applications, set up stand
 * types, approve (which emails a payment link) or decline, and number stands.
 */
export function ExhibitorsTab({ event }: { event: EventRecord }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [settings, setSettings] = useState({ enabled: false, intro: "", deadline: "" });
  const [stands, setStands] = useState<StandType[]>([]);
  const [rows, setRows] = useState<Exhibitor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | ExhibitorStatus>("all");
  const [editing, setEditing] = useState<Partial<StandType> | null>(null);
  const [declining, setDeclining] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, { passes: number; leads: number }>>({});
  const [plan, setPlan] = useState<{ url: string | null; orgId: string }>({ url: null, orgId: "" });
  const [placing, setPlacing] = useState<string | null>(null);
  const [uploadingPlan, setUploadingPlan] = useState(false);

  const load = useCallback(async () => {
    const [ev, st, ex] = await Promise.all([
      supabase.from("events").select("organization_id, floor_plan_url, exhibitors_enabled, exhibitor_intro, exhibitor_deadline").eq("id", event.id).maybeSingle(),
      supabase.from("stand_types").select("id, name, description, price_naira, quantity, passes_included").eq("event_id", event.id).order("price_naira"),
      supabase.from("exhibitors").select("*").eq("event_id", event.id).order("applied_at", { ascending: false }),
    ]);
    // staff passes and leads per paid exhibitor (0113)
    const [passes, leads] = await Promise.all([
      supabase.from("registrations").select("exhibitor_id").eq("event_id", event.id).not("exhibitor_id", "is", null).neq("status", "cancelled"),
      supabase.from("exhibitor_leads").select("exhibitor_id").eq("event_id", event.id),
    ]);
    const c: Record<string, { passes: number; leads: number }> = {};
    for (const r of (passes.data ?? []) as { exhibitor_id: string }[]) (c[r.exhibitor_id] ??= { passes: 0, leads: 0 }).passes++;
    for (const r of (leads.data ?? []) as { exhibitor_id: string }[]) (c[r.exhibitor_id] ??= { passes: 0, leads: 0 }).leads++;
    setCounts(c);
    if (ev.data) {
      setSettings({ enabled: ev.data.exhibitors_enabled, intro: ev.data.exhibitor_intro ?? "", deadline: ev.data.exhibitor_deadline ?? "" });
      setPlan({ url: ev.data.floor_plan_url, orgId: ev.data.organization_id });
    }
    setStands(((st.data ?? []) as StandType[]).map((s) => ({ ...s, price_naira: Number(s.price_naira) })));
    setRows((ex.data ?? []) as Exhibitor[]);
    setLoaded(true);
  }, [supabase, event.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  const taken = (standId: string) => rows.filter((r) => r.stand_type_id === standId && (r.status === "approved" || r.status === "paid")).length;
  const standName = (id: string | null) => stands.find((s) => s.id === id)?.name ?? "Stand";
  const paid = rows.filter((r) => r.status === "paid");
  const revenue = paid.reduce((s, r) => s + Number(r.amount_naira ?? 0), 0);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const link = typeof window !== "undefined" && event.slug ? `${window.location.origin}/${event.slug}/exhibit` : "";

  async function saveSettings(next = settings) {
    const { error } = await supabase
      .from("events")
      .update({ exhibitors_enabled: next.enabled, exhibitor_intro: next.intro.trim() || null, exhibitor_deadline: next.deadline || null })
      .eq("id", event.id);
    if (error) return toast.error("Couldn't save the exhibitor settings.");
    toast.success(next.enabled ? "Exhibitor applications are open" : "Exhibitor settings saved");
  }

  async function saveStand() {
    if (!editing) return;
    const name = (editing.name ?? "").trim();
    // free is an explicit choice (the tickbox), never an empty price
    const price = editing.price_naira == null ? NaN : Number(editing.price_naira);
    if (!name) return toast.error("Give the stand type a name.");
    if (!(price === 0 || price >= 100)) return toast.error("Enter a price of at least ₦100, or tick Free stand.");
    const row = { name, description: editing.description?.trim() || null, price_naira: price, quantity: editing.quantity || null, passes_included: Math.max(0, Math.min(50, Number(editing.passes_included ?? 2))) };
    const { error } = editing.id
      ? await supabase.from("stand_types").update(row).eq("id", editing.id)
      : await supabase.from("stand_types").insert({ ...row, organization_id: undefined, event_id: event.id });
    if (error) return toast.error(error.message);
    setEditing(null);
    load();
  }

  async function removeStand(s: StandType) {
    if (taken(s.id) > 0) return toast.error("This stand type has approved or paid exhibitors, so it can't be deleted.");
    if (!confirm(`Delete the ${s.name} stand type?`)) return;
    const { error } = await supabase.from("stand_types").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function decide(id: string, action: "approve" | "decline" | "cancel", reason?: string) {
    if (action === "cancel" && !confirm("Cancel this approval? The stand is released and their payment link stops working.")) return;
    setBusy(id);
    const res = await post("/api/exhibitors/decide", { exhibitorId: id, action, reason });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't update this application.");
    toast.success(
      action === "approve" && (res as { free?: boolean }).free
        ? res.emailed === false
          ? "Approved and confirmed (free stand). We couldn't email them, so copy their portal link below."
          : "Approved and confirmed (free stand). We've emailed them their exhibitor portal."
        : action === "approve"
        ? res.emailed === false
          ? "Approved. We couldn't email them, so send them the payment link yourself."
          : "Approved. We've emailed them a link to pay for their stand."
        : action === "decline"
          ? "Declined and emailed"
          : "Approval cancelled, stand released"
    );
    setDeclining(null);
    load();
  }

  async function resendPortal(id: string) {
    setBusy(id);
    const res = await post("/api/exhibitors/portal-link", { exhibitorId: id });
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't send it.");
    toast.success("Portal link emailed to the exhibitor");
  }

  async function uploadPlan(file: File) {
    setUploadingPlan(true);
    try {
      const dataUrl = await compressImageFile(file, 2400, 0.88);
      const url = await uploadEventMedia(`${plan.orgId}/floorplans/${event.id}`, dataUrl);
      const { error } = await supabase.from("events").update({ floor_plan_url: url }).eq("id", event.id);
      if (error) throw error;
      setPlan((p) => ({ ...p, url }));
      toast.success("Floor plan uploaded. Now place each stand on it.");
    } catch {
      toast.error("Couldn't upload the floor plan. Try a smaller image.");
    } finally {
      setUploadingPlan(false);
    }
  }

  async function removePlan() {
    if (!confirm("Remove the floor plan? Stand pins are kept in case you upload a new one.")) return;
    const { error } = await supabase.from("events").update({ floor_plan_url: null }).eq("id", event.id);
    if (error) return toast.error("Couldn't remove it.");
    await deleteEventMedia(`${plan.orgId}/floorplans/${event.id}`);
    setPlan((p) => ({ ...p, url: null }));
  }

  async function placePin(x: number, y: number) {
    if (!placing) return;
    const id = placing;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, map_x: x, map_y: y } : r)));
    setPlacing(null);
    const { error } = await supabase.from("exhibitors").update({ map_x: Number(x.toFixed(4)), map_y: Number(y.toFixed(4)) }).eq("id", id);
    if (error) toast.error("Couldn't save the pin.");
  }

  async function saveLabel(id: string, label: string) {
    const { error } = await supabase.from("exhibitors").update({ stand_label: label }).eq("id", id);
    if (error) toast.error("Couldn't save the stand number.");
  }

  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl bg-fill" />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Applications", value: String(rows.filter((r) => r.status !== "cancelled").length), sub: `${rows.filter((r) => r.status === "applied").length} waiting for you` },
          { label: "Stands confirmed", value: String(paid.length), sub: `${rows.filter((r) => r.status === "approved").length} awaiting payment` },
          { label: "Stand sales", value: formatNaira(revenue), sub: "paid by exhibitors" },
        ].map((c) => (
          <div key={c.label} className="eb-ov-card">
            <p className="eb-ov-label">{c.label}</p>
            <p className="eb-ov-value">{c.value}</p>
            <p className="eb-ov-sub">{c.sub}</p>
          </div>
        ))}
      </div>

      <section className="eb-ov-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eb-ov-title flex items-center gap-2">
              <Store size={16} className="text-[#ff8af5]" aria-hidden="true" /> Exhibitor applications
            </p>
            <p className="mt-1 text-sm text-muted">Companies apply for a stand on your exhibit page. You approve, they pay.</p>
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium text-fg">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.enabled}
              onChange={(e) => {
                if (e.target.checked && stands.length === 0) return toast.error("Add at least one stand type first.");
                const next = { ...settings, enabled: e.target.checked };
                setSettings(next);
                saveSettings(next);
              }}
            />
            Taking applications
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px]">
          <div>
            <label htmlFor="ex-intro" className="eb-label">Note for exhibitors</label>
            <textarea id="ex-intro" rows={2} className="eb-input" placeholder="Who you're looking for, what's included, setup times…" value={settings.intro} onChange={(e) => setSettings({ ...settings, intro: e.target.value })} onBlur={() => saveSettings()} />
          </div>
          <div>
            <label htmlFor="ex-deadline" className="eb-label">Applications close</label>
            <input id="ex-deadline" type="date" className="eb-input" value={settings.deadline} onChange={(e) => setSettings({ ...settings, deadline: e.target.value })} onBlur={() => saveSettings()} />
          </div>
        </div>
        {settings.enabled && link && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-fill px-3 py-2 text-xs text-fg-2">{link}</code>
            <button type="button" className="eb-btn eb-btn--ghost" onClick={() => copyText(link).then(() => toast.success("Exhibit page link copied"))}>
              <Copy size={14} /> Copy link
            </button>
            <a href={link} target="_blank" rel="noreferrer" className="eb-btn eb-btn--ghost">
              <ExternalLink size={14} /> View page
            </a>
          </div>
        )}
        {event.published === false && settings.enabled && <p className="mt-3 text-xs text-amber-300">Your event is a draft: the exhibit page opens once you publish it.</p>}
      </section>

      <section className="eb-ov-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eb-ov-title flex items-center gap-2">
              <MapIcon size={16} className="text-[#ff8af5]" aria-hidden="true" /> Floor plan
            </p>
            <p className="mt-1 text-sm text-muted">Attendees see it in their Event Hub with every stand pinned, and tap a company to find it.</p>
          </div>
          <div className="flex gap-2">
            <label className="eb-btn eb-btn--ghost cursor-pointer">
              <ImagePlus size={14} aria-hidden="true" /> {uploadingPlan ? "Uploading…" : plan.url ? "Replace" : "Upload floor plan"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploadingPlan} onChange={(e) => e.target.files?.[0] && uploadPlan(e.target.files[0])} />
            </label>
            {plan.url && (
              <button type="button" className="eb-btn eb-btn--ghost" onClick={removePlan}>
                Remove
              </button>
            )}
          </div>
        </div>
        {plan.url && (
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <FloorPlan
              src={plan.url}
              pins={paid.filter((r) => r.map_x != null && r.map_y != null).map((r) => ({ id: r.id, label: r.stand_label ?? "", x: Number(r.map_x), y: Number(r.map_y), title: r.company_name }))}
              activeId={placing}
              onPick={placing ? placePin : undefined}
              onPinClick={(id) => setPlacing(id)}
            />
            <div>
              <p className="mb-2 text-xs text-muted">{placing ? `Tap the plan where ${rows.find((r) => r.id === placing)?.company_name}'s stand is.` : "Pick an exhibitor, then tap their spot on the plan."}</p>
              {paid.length === 0 ? (
                <p className="text-sm text-subtle">Paid exhibitors appear here.</p>
              ) : (
                <ul className="space-y-1.5">
                  {paid.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setPlacing(placing === r.id ? null : r.id)} className="eb-plan-pick" aria-pressed={placing === r.id}>
                        <span className="min-w-0 flex-1 truncate text-left">{r.company_name}</span>
                        <span className="shrink-0 text-xs text-subtle">{r.stand_label ? `Stand ${r.stand_label}` : "No stand #"} · {r.map_x != null ? "placed" : "not placed"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="eb-ov-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="eb-ov-title">Stand types</p>
          <button type="button" className="eb-btn eb-btn--ghost" onClick={() => setEditing({ name: "", price_naira: undefined, quantity: null, description: "", passes_included: 2 })}>
            <Plus size={14} /> Add stand type
          </button>
        </div>
        {stands.length === 0 ? (
          <p className="py-6 text-center text-sm text-subtle">No stand types yet. Add one, e.g. &ldquo;Standard 3×3m&rdquo; at ₦150,000.</p>
        ) : (
          <ul className="space-y-2">
            {stands.map((s) => (
              <li key={s.id} className="eb-ov-row">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    {s.name} <span className="font-normal text-muted">· {s.price_naira === 0 ? "Free" : formatNaira(s.price_naira)} · {s.passes_included} staff pass{s.passes_included === 1 ? "" : "es"}</span>
                  </p>
                  {s.description && <p className="truncate text-xs text-muted">{s.description}</p>}
                </div>
                <p className="text-sm tabular-nums text-fg-3">
                  {taken(s.id)}
                  {s.quantity != null ? ` / ${s.quantity}` : ""} taken
                </p>
                <button type="button" className="rounded-lg p-1.5 text-subtle hover:text-fg" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                  <Pencil size={15} />
                </button>
                <button type="button" className="rounded-lg p-1.5 text-subtle hover:text-rose-300" aria-label={`Delete ${s.name}`} onClick={() => removeStand(s)}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {editing && (
          <div className="mt-4 grid gap-3 rounded-xl p-4 ring-1 ring-line sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label htmlFor="st-name" className="eb-label eb-req">Stand type</label>
              <input id="st-name" className="eb-input" maxLength={80} placeholder="Standard 3×3m" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="st-price" className="eb-label eb-req">Price (₦)</label>
              <input
                id="st-price"
                className="eb-input"
                inputMode="numeric"
                placeholder={editing.price_naira === 0 ? "Free" : "150000"}
                disabled={editing.price_naira === 0}
                value={editing.price_naira ? String(editing.price_naira) : ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setEditing({ ...editing, price_naira: digits ? Number(digits) : undefined });
                }}
              />
              <label className="mt-1.5 flex items-center gap-2 text-xs text-fg-3">
                <input type="checkbox" className="h-3.5 w-3.5" checked={editing.price_naira === 0} onChange={(e) => setEditing({ ...editing, price_naira: e.target.checked ? 0 : undefined })} />
                Free stand: approving an application confirms it, no payment
              </label>
            </div>
            <div>
              <label htmlFor="st-qty" className="eb-label">How many</label>
              <input id="st-qty" className="eb-input" inputMode="numeric" placeholder="No limit" value={editing.quantity ? String(editing.quantity) : ""} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value.replace(/\D/g, "")) || null })} />
            </div>
            <div>
              <label htmlFor="st-passes" className="eb-label">Staff passes</label>
              <input id="st-passes" className="eb-input" inputMode="numeric" value={String(editing.passes_included ?? 2)} onChange={(e) => setEditing({ ...editing, passes_included: Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="st-desc" className="eb-label">What&apos;s included</label>
              <input id="st-desc" className="eb-input" maxLength={1000} placeholder="Table, 2 chairs, power point, 2 exhibitor passes" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <button type="button" className="eb-btn eb-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="eb-btn eb-btn--primary" onClick={saveStand}>{editing.id ? "Save" : "Add stand type"}</button>
            </div>
          </div>
        )}
      </section>

      <section className="eb-ov-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="eb-ov-title">Exhibitors</p>
          <div className="eb-seg" role="group" aria-label="Filter exhibitors">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-subtle">{rows.length === 0 ? "No applications yet. Share your exhibit page link to get some." : "Nothing here."}</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id} className="rounded-xl bg-[rgb(255_255_255/0.035)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-fg">
                      {r.company_name}
                      <span className="eb-exh-status" data-status={r.status}>{STATUS_LABEL[r.status]}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-fg-3">
                      {standName(r.stand_type_id)}
                      {r.category ? ` · ${r.category}` : ""} · applied {new Date(r.applied_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {r.paid_at && (Number(r.amount_naira ?? 0) > 0 ? ` · paid ${formatNaira(Number(r.amount_naira))}` : " · free stand")}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{r.contact_name}</span>
                      <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 hover:text-fg"><Mail size={12} /> {r.email}</a>
                      {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:text-fg"><Phone size={12} /> {r.phone}</a>}
                      {r.website && <a href={r.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-fg"><Globe size={12} /> Website</a>}
                    </p>
                    {r.description && <p className="mt-2 max-w-2xl text-sm text-fg-3">{r.description}</p>}
                    {r.status === "declined" && r.decline_reason && <p className="mt-1 text-xs text-subtle">Your note: {r.decline_reason}</p>}
                    {r.status === "paid" && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-fg-3">
                          {counts[r.id]?.passes ?? 0}/{stands.find((s) => s.id === r.stand_type_id)?.passes_included ?? 0} staff passes · {counts[r.id]?.leads ?? 0} lead{(counts[r.id]?.leads ?? 0) === 1 ? "" : "s"} scanned
                        </span>
                        <button
                          type="button"
                          className="eb-link"
                          onClick={() => copyText(`${window.location.origin}/exhibitor/${r.portal_token}`).then(() => toast.success("Portal link copied. Share it only with this exhibitor."))}
                        >
                          Copy portal link
                        </button>
                        <button type="button" className="eb-link" disabled={busy === r.id} onClick={() => resendPortal(r.id)}>
                          Email portal link
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(r.status === "approved" || r.status === "paid") && (
                      <input
                        aria-label={`Stand number for ${r.company_name}`}
                        className="eb-input"
                        // .eb-input is full width outside Tailwind's layers, so size it inline
                        style={{ width: 104 }}
                        placeholder="Stand #"
                        maxLength={20}
                        defaultValue={r.stand_label ?? ""}
                        onBlur={(e) => e.target.value !== (r.stand_label ?? "") && saveLabel(r.id, e.target.value)}
                      />
                    )}
                    {r.status === "applied" && (
                      <>
                        <button type="button" disabled={busy === r.id} className="eb-btn eb-btn--primary" onClick={() => decide(r.id, "approve")}>
                          <Check size={14} /> Approve
                        </button>
                        <button type="button" disabled={busy === r.id} className="eb-btn eb-btn--ghost" onClick={() => setDeclining({ id: r.id, reason: "" })}>
                          <X size={14} /> Decline
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button type="button" disabled={busy === r.id} className="eb-btn eb-btn--ghost" onClick={() => decide(r.id, "cancel")}>
                        Cancel approval
                      </button>
                    )}
                  </div>
                </div>
                {declining?.id === r.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      className="eb-input min-w-0 flex-1"
                      aria-label="Reason they'll see"
                      placeholder="Reason they'll see, e.g. we're full for your category"
                      maxLength={500}
                      value={declining.reason}
                      onChange={(e) => setDeclining({ id: r.id, reason: e.target.value })}
                    />
                    <button type="button" disabled={busy === r.id} className="eb-btn eb-btn--primary" onClick={() => decide(r.id, "decline", declining.reason.trim() || undefined)}>
                      Decline
                    </button>
                    <button type="button" className="eb-btn eb-btn--ghost" onClick={() => setDeclining(null)}>Keep</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
