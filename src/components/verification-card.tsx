"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, BadgeCheck, Clock3, FileUp, ShieldCheck } from "lucide-react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMySalesLimit } from "@/lib/store";

const ID_TYPES = [
  { id: "nin", label: "NIN slip or card" },
  { id: "drivers_licence", label: "Driver's licence" },
  { id: "passport", label: "International passport" },
  { id: "voters_card", label: "Voter's card" },
] as const;

type Latest = { status: "pending" | "approved" | "declined"; decline_reason: string | null; created_at: string } | null;

function readFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (f.size > 5 * 1024 * 1024) return reject(new Error("Each document must be under 5 MB."));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(f);
  });
}

/** Payouts → "Get verified" (0118): verified organizers have no paid-ticket
 *  limit and can withdraw before their events end. */
export function VerificationCard() {
  const [state, setState] = useState<{ verified: boolean; cap: number | null; sold: number; latest: Latest } | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", businessName: "", idType: "nin", cacNumber: "", socialLink: "", note: "" });
  const [idDoc, setIdDoc] = useState<{ name: string; data: string } | null>(null);
  const [cacDoc, setCacDoc] = useState<{ name: string; data: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const limit = await getMySalesLimit();
    const { data } = await createSupabaseBrowserClient()
      .from("organizer_verification_requests")
      .select("status, decline_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setState({ verified: !!limit?.verified, cap: limit?.cap ?? null, sold: limit?.sold ?? 0, latest: (data as Latest) ?? null });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>, set: (v: { name: string; data: string } | null) => void) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      set({ name: f.name, data: await readFile(f) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.fullName.trim().length < 2) return toast.error("Enter your full name as it appears on your ID.");
    if (!idDoc) return toast.error("Add a photo or scan of your ID.");
    setSending(true);
    try {
      const res = await fetch("/api/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          businessName: form.businessName || undefined,
          cacNumber: form.cacNumber || undefined,
          socialLink: form.socialLink || undefined,
          note: form.note || undefined,
          idDocument: idDoc.data,
          cacDocument: cacDoc?.data,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't send your request.");
      toast.success("Sent. We'll review your documents and email you, usually within one working day.");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your request.");
    } finally {
      setSending(false);
    }
  }

  if (!state) return null;

  if (state.verified) {
    return (
      <div id="verify" className="eb-card mb-6 flex items-center gap-3 p-4">
        <BadgeCheck size={20} className="shrink-0 text-emerald-300" aria-hidden="true" />
        <p className="text-sm text-fg-2">
          <strong className="text-fg">Your account is verified.</strong> No limit on paid ticket sales, and you can withdraw cleared money before your events end.
        </p>
      </div>
    );
  }

  if (state.latest?.status === "pending") {
    return (
      <div id="verify" className="eb-card mb-6 flex items-center gap-3 p-4">
        <Clock3 size={20} className="shrink-0 text-amber-300" aria-hidden="true" />
        <p className="text-sm text-fg-2">
          <strong className="text-fg">We&apos;re reviewing your documents.</strong> We&apos;ll email you, usually within one working day.
        </p>
      </div>
    );
  }

  return (
    <section id="verify" className="eb-card mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <ShieldCheck size={17} className="text-[#ff8af5]" aria-hidden="true" /> Get verified
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            New accounts can sell {state.cap ?? 100} paid tickets{state.cap != null ? ` (you've sold ${state.sold})` : ""} and withdraw a few days after each event ends. Verify your identity to lift the limit and get paid sooner.
          </p>
        </div>
        {!open && (
          <button type="button" className="eb-btn eb-btn--primary" onClick={() => setOpen(true)}>
            {state.latest?.status === "declined" ? "Send new documents" : "Get verified"}
          </button>
        )}
      </div>
      {state.latest?.status === "declined" && (
        <p className="eb-alert mt-4" role="status">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> We couldn&apos;t verify you last time{state.latest.decline_reason ? `: ${state.latest.decline_reason}` : "."}
        </p>
      )}
      {open && (
        <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="vr-name" className="eb-label eb-req">Full name (as on your ID)</label>
            <input id="vr-name" className="eb-input" autoComplete="name" maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="vr-biz" className="eb-label">Business name</label>
            <input id="vr-biz" className="eb-input" maxLength={160} placeholder="If you trade as a business" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="vr-idtype" className="eb-label eb-req">ID type</label>
            <select id="vr-idtype" className="eb-input" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
              {ID_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="eb-label eb-req">Photo or scan of your ID</span>
            <label className="eb-btn eb-btn--ghost w-full cursor-pointer justify-start">
              <FileUp size={14} aria-hidden="true" /> <span className="truncate">{idDoc ? idDoc.name : "Choose a file (JPG, PNG or PDF, under 5 MB)"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e, setIdDoc)} />
            </label>
          </div>
          <div>
            <label htmlFor="vr-cac" className="eb-label">CAC registration number</label>
            <input id="vr-cac" className="eb-input" maxLength={40} placeholder="RC or BN number, if registered" value={form.cacNumber} onChange={(e) => setForm({ ...form, cacNumber: e.target.value })} />
          </div>
          <div>
            <span className="eb-label">CAC certificate</span>
            <label className="eb-btn eb-btn--ghost w-full cursor-pointer justify-start">
              <FileUp size={14} aria-hidden="true" /> <span className="truncate">{cacDoc ? cacDoc.name : "Optional"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e, setCacDoc)} />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="vr-social" className="eb-label">Instagram, website or past events</label>
            <input id="vr-social" className="eb-input" inputMode="url" maxLength={300} placeholder="instagram.com/yourevents" value={form.socialLink} onChange={(e) => setForm({ ...form, socialLink: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="vr-note" className="eb-label">Anything else we should know</label>
            <textarea id="vr-note" rows={2} className="eb-input" maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <p className="text-xs text-subtle sm:col-span-2">
            Your documents are stored privately and only eventbuddy&apos;s team can see them. Tip: the name on your payout bank account should match your ID or business name.
          </p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="eb-btn eb-btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" disabled={sending} className="eb-btn eb-btn--primary">{sending ? "Sending…" : "Send for review"}</button>
          </div>
        </form>
      )}
    </section>
  );
}
