"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, Megaphone, PauseCircle, PlayCircle, UserPlus } from "lucide-react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMyPlan, getOrganizerPlans, refreshData } from "@/lib/store";
import type { EventRecord, OrganizerPlan } from "@/lib/types";

type Settings = { enabled: boolean; pct: string; cap: string; access: "open" | "verified" | "invite"; caption: string };
type PromoterRow = { id: string; code: string; is_active: boolean; click_count: number; partner_name: string };

/** Event → Referrals: the organizer's promoter program (migration 0105). Turn
 *  it on, set the commission (% of net after eventbuddy's fee, 5% minimum),
 *  an optional cap per ticket, who may join, and a caption promoters can
 *  share. Promoters appear in the partner table below with their stats. */
export function PromoterProgramPanel({ event }: { event: EventRecord }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [promoters, setPromoters] = useState<PromoterRow[]>([]);
  const [plan, setPlan] = useState<OrganizerPlan | null>(null);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: ev }, { data: rows }, plans, mine] = await Promise.all([
      supabase.from("events").select("promoter_program_enabled, promoter_commission_pct, promoter_commission_cap_naira, promoter_access, promoter_share_caption").eq("id", event.id).maybeSingle(),
      supabase.from("event_referrals").select("id, code, is_active, click_count, partner_name").eq("event_id", event.id).not("promoter_id", "is", null).order("created_at"),
      getOrganizerPlans().catch(() => []),
      getMyPlan().catch(() => null),
    ]);
    if (ev) {
      const next: Settings = {
        enabled: ev.promoter_program_enabled,
        pct: String(Number(ev.promoter_commission_pct)),
        cap: ev.promoter_commission_cap_naira == null ? "" : String(Number(ev.promoter_commission_cap_naira)),
        access: ev.promoter_access,
        caption: ev.promoter_share_caption ?? "",
      };
      setS(next);
      setSaved(next);
    }
    setPromoters((rows ?? []) as PromoterRow[]);
    setPlan(plans.find((p) => p.id === (mine?.effectivePlanId ?? "launch")) ?? null);
  }, [event.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  if (!s) return null;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const activeCount = promoters.filter((p) => p.is_active).length;
  const limit = plan?.maxPromotersPerEvent ?? null;

  async function save() {
    if (!s) return;
    const pct = Number(s.pct);
    const cap = s.cap.trim() === "" ? null : Number(s.cap);
    if (!(pct >= 5 && pct <= 100)) return setError("Commission must be between 5% and 100% of your net.");
    if (cap != null && !(cap > 0)) return setError("The cap per ticket must be more than ₦0, or leave it empty for no cap.");
    setError("");
    setBusy("save");
    const { error: e } = await createSupabaseBrowserClient()
      .from("events")
      .update({ promoter_program_enabled: s.enabled, promoter_commission_pct: pct, promoter_commission_cap_naira: cap, promoter_access: s.access, promoter_share_caption: s.caption.trim() || null })
      .eq("id", event.id);
    setBusy(null);
    if (e) return setError(e.message);
    toast.success(s.enabled ? "Promoter program saved" : "Promoter program turned off");
    load();
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.trim()) return;
    setBusy("invite");
    const res = await fetch("/api/promoters/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: event.id, handle: invite }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.error(json.error || "Couldn't add that promoter.");
    toast.success(`@${json.promoter.handle} can now promote this event`);
    setInvite("");
    load();
    refreshData();
  }

  async function toggle(p: PromoterRow) {
    setBusy(p.id);
    const { error: e } = await createSupabaseBrowserClient().from("event_referrals").update({ is_active: !p.is_active }).eq("id", p.id);
    setBusy(null);
    if (e) return toast.error(e.message);
    toast.success(p.is_active ? "Promoter paused: their link stops earning" : "Promoter active again");
    load();
    refreshData();
  }

  return (
    <section className="eb-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-fg">
            <Megaphone size={16} className="text-brand-500" aria-hidden="true" /> Promoter program
          </h2>
          <p className="mt-0.5 max-w-xl text-sm text-muted">
            List this event on the promoter marketplace. Promoters share their own link and earn a commission on every paid ticket it sells,
            taken from your balance automatically.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-fg-2">
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-4 w-4" />
          Pay promoters on this event
        </label>
      </div>

      {s.enabled && (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pp-pct" className="eb-label">Commission (% of your net)</label>
            <input id="pp-pct" type="number" min="5" max="100" step="0.5" value={s.pct} onChange={(e) => setS({ ...s, pct: e.target.value })} className="eb-input" />
            <p className="eb-hint mt-1">Minimum 5%. Worked out after eventbuddy&apos;s fee.</p>
          </div>
          <div>
            <label htmlFor="pp-cap" className="eb-label">Cap per ticket (₦, optional)</label>
            <input id="pp-cap" type="number" min="1" placeholder="No cap" value={s.cap} onChange={(e) => setS({ ...s, cap: e.target.value })} className="eb-input" />
          </div>
          <div>
            <label htmlFor="pp-access" className="eb-label">Who can promote</label>
            <select id="pp-access" value={s.access} onChange={(e) => setS({ ...s, access: e.target.value as Settings["access"] })} className="eb-input">
              <option value="open">Open: any promoter</option>
              <option value="invite">Invite only: you add them by handle</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="pp-caption" className="eb-label">Share caption (optional)</label>
            <textarea
              id="pp-caption"
              rows={2}
              maxLength={500}
              value={s.caption}
              onChange={(e) => setS({ ...s, caption: e.target.value })}
              placeholder={`Join me at ${event.name}! Get your ticket here:`}
              className="eb-input"
            />
            <p className="eb-hint mt-1">Promoters copy this with their own link added at the end.</p>
          </div>
        </div>
      )}

      {error && (
        <p className="eb-alert mt-4 flex items-start gap-2" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {dirty && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={save} disabled={busy === "save"} className="eb-btn eb-btn--primary">
            {busy === "save" ? "Saving…" : "Save promoter settings"}
          </button>
        </div>
      )}

      {saved?.enabled && (
        <div className="mt-6 border-t border-line-soft pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg">
              Promoters{" "}
              <span className="font-normal text-muted">
                {activeCount}
                {limit != null ? ` of ${limit} on ${plan?.name}` : " active"}
              </span>
            </p>
            {limit != null && activeCount >= limit && (
              <Link href="/admin?tab=plan" className="eb-link text-xs">
                Upgrade for unlimited promoters
              </Link>
            )}
          </div>
          <form onSubmit={sendInvite} className="mb-3 flex flex-wrap gap-2">
            <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="@handle" aria-label="Promoter handle" className="eb-input min-w-0 flex-1" />
            <button type="submit" disabled={busy === "invite" || !invite.trim()} className="eb-btn eb-btn--ghost">
              <UserPlus size={14} aria-hidden="true" /> Add promoter
            </button>
          </form>
          {promoters.length === 0 ? (
            <p className="text-sm text-muted">
              {saved.access === "open" ? "No promoters yet. Your event is on the marketplace, so promoters can join any time." : "No promoters yet. Add one by their handle."}
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {promoters.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className={`truncate text-sm ${p.is_active ? "text-fg" : "text-muted line-through"}`}>{p.partner_name}</p>
                    <p className="text-xs text-subtle">{p.click_count} clicks · stats in the table below</p>
                  </div>
                  <button type="button" disabled={busy === p.id} onClick={() => toggle(p)} className="eb-btn eb-btn--ghost">
                    {p.is_active ? <PauseCircle size={14} aria-hidden="true" /> : <PlayCircle size={14} aria-hidden="true" />} {p.is_active ? "Pause" : "Resume"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
