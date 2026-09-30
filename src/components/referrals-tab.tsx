"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Plus, Trash2, Download, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { CommissionType, EventRecord, ReferralPartner } from "@/lib/types";
import { COMMISSION_LABELS, referralLink, type ReferralTally } from "@/lib/referrals";
import { addReferral, deleteReferral, fetchReferralTallies, updateReferral, PersistError } from "@/lib/store";
import { formatNaira } from "@/lib/billing";
import { downloadCsv, referralsToCsv } from "@/lib/csv";

const EMPTY: ReferralTally = { registrations: 0, paidTickets: 0, grossNaira: 0, netNaira: 0, commissionNaira: 0 };

const TYPES: CommissionType[] = ["percent_gross", "percent_net", "fixed_per_sale", "fixed_per_reg", "none"];

/** Codes go in a URL and get read aloud, so keep them unambiguous. */
function slugifyCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function ReferralsTab({
  event,
  orgSlug,
  referrals,
}: {
  event: EventRecord;
  orgSlug: string;
  referrals: ReferralPartner[];
}) {
  const mine = useMemo(
    () => referrals.filter((r) => r.eventId === event.id).sort((a, b) => a.partnerName.localeCompare(b.partnerName)),
    [referrals, event.id]
  );

  const [loaded, setLoaded] = useState<{ key: string; tallies: Record<string, ReferralTally> } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<CommissionType>("percent_gross");
  const [rate, setRate] = useState("10");

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Refetch when the event changes or a partner is added/removed. Loading is
  // DERIVED from whether the results in hand belong to the current key, rather
  // than flipped with a setState at the top of the effect — same UI, no
  // cascading render.
  const tallyKey = `${event.id}:${mine.length}`;
  useEffect(() => {
    let live = true;
    fetchReferralTallies(event.id)
      .then((t) => { if (live) setLoaded({ key: tallyKey, tallies: t }); })
      .catch(() => { if (live) setLoaded({ key: tallyKey, tallies: {} }); });
    return () => { live = false; };
  }, [event.id, tallyKey]);

  const loadingTallies = loaded?.key !== tallyKey;
  // Memoised so the empty-object fallback isn't a new reference every render,
  // which would re-run the totals below continuously.
  const tallies = useMemo(
    () => (loaded?.key === tallyKey ? loaded.tallies : {}),
    [loaded, tallyKey]
  );

  const totals = useMemo(() => {
    return mine.reduce(
      (acc, r) => {
        const t = tallies[r.id] ?? EMPTY;
        acc.registrations += t.registrations;
        acc.paidTickets += t.paidTickets;
        acc.grossNaira += t.grossNaira;
        acc.commissionNaira += t.commissionNaira;
        return acc;
      },
      { registrations: 0, paidTickets: 0, grossNaira: 0, commissionNaira: 0 }
    );
  }, [mine, tallies]);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = slugifyCode(code || name);
    if (!name.trim() || !cleanCode) {
      toast.error("A partner needs a name and a code.");
      return;
    }
    if (mine.some((r) => r.code.toUpperCase() === cleanCode)) {
      toast.error(`"${cleanCode}" is already used on this event.`);
      return;
    }
    setSaving(true);
    try {
      await addReferral({
        eventId: event.id,
        code: cleanCode,
        partnerName: name.trim(),
        partnerEmail: email.trim() || undefined,
        commissionType: type,
        commissionRate: Number(rate) || 0,
        isActive: true,
      });
      toast.success(`${name.trim()} added`);
      setName(""); setCode(""); setEmail(""); setRate("10"); setType("percent_gross");
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't add that partner.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: ReferralPartner) {
    try {
      await updateReferral(r.id, { isActive: !r.isActive });
    } catch {
      toast.error("Couldn't update that partner.");
    }
  }

  async function remove(r: ReferralPartner) {
    const t = tallies[r.id] ?? EMPTY;
    const warning =
      t.registrations > 0
        ? `Delete ${r.partnerName}? Their ${t.registrations} attributed ${t.registrations === 1 ? "signup" : "signups"} stay, but stop being credited to anyone. Deactivating keeps the record.`
        : `Delete ${r.partnerName}?`;
    if (!window.confirm(warning)) return;
    try {
      await deleteReferral(r.id);
      toast.success(`${r.partnerName} removed`);
    } catch {
      toast.error("Couldn't remove that partner.");
    }
  }

  function exportCsv() {
    downloadCsv(
      `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-referrals.csv`,
      referralsToCsv(mine, tallies, COMMISSION_LABELS)
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-slate-900">Referral partners</h2>
          <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
            Give each partner their own link. Anything booked through it is credited to them for 30 days,
            and the commission below is what you owe once the event is done.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mine.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Export
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C21FAF] px-3 py-2 text-sm font-semibold text-white hover:bg-[#A8158F]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add partner
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={create} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ref-name" className="block text-sm font-medium text-slate-700 mb-1.5">Partner name *</label>
            <input
              id="ref-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Campus Reps NG"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </div>
          <div>
            <label htmlFor="ref-code" className="block text-sm font-medium text-slate-700 mb-1.5">Link code</label>
            <input
              id="ref-code" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder={name ? slugifyCode(name) : "CAMPUS-REPS"}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">Left blank, it&rsquo;s made from the name.</p>
          </div>
          <div>
            <label htmlFor="ref-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email (optional)</label>
            <input
              id="ref-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ref-type" className="block text-sm font-medium text-slate-700 mb-1.5">Commission</label>
              <select
                id="ref-type" value={type} onChange={(e) => setType(e.target.value as CommissionType)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white cursor-pointer"
              >
                {TYPES.map((t) => <option key={t} value={t}>{COMMISSION_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ref-rate" className="block text-sm font-medium text-slate-700 mb-1.5">
                {type.startsWith("percent") ? "Percent" : "Amount ₦"}
              </label>
              <input
                id="ref-rate" type="number" min="0" step="0.01" value={rate}
                onChange={(e) => setRate(e.target.value)} disabled={type === "none"}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white disabled:bg-slate-100 tabular-nums"
              />
            </div>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm font-medium text-slate-600">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#C21FAF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Add partner
            </button>
          </div>
        </form>
      )}

      {mine.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <Link2 className="w-8 h-8 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-600 font-medium">No referral partners yet</p>
          <p className="text-sm text-slate-500 mt-1">Add one to get a shareable link and start attributing signups.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Signups referred", value: totals.registrations.toLocaleString("en-NG") },
              { label: "Paid tickets", value: totals.paidTickets.toLocaleString("en-NG") },
              { label: "Revenue referred", value: formatNaira(totals.grossNaira) },
              { label: "Commission owed", value: formatNaira(totals.commissionNaira), accent: true },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.accent ? "border-[#C21FAF]/30 bg-[#FFF3FD]" : "border-slate-200 bg-white"}`}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.accent ? "text-[#C21FAF]" : "text-slate-900"}`}>
                  {loadingTallies ? "—" : s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Partner</th>
                  <th className="text-left px-4 py-2.5 font-medium">Link</th>
                  <th className="text-right px-4 py-2.5 font-medium">Clicks</th>
                  <th className="text-right px-4 py-2.5 font-medium">Signups</th>
                  <th className="text-right px-4 py-2.5 font-medium">Paid</th>
                  <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium">Owed</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mine.map((r) => {
                  const t = tallies[r.id] ?? EMPTY;
                  const link = referralLink(siteUrl, orgSlug, event.id, r.code);
                  return (
                    <tr key={r.id} className={r.isActive ? "" : "opacity-55"}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.partnerName}</div>
                        <div className="text-xs text-slate-500">
                          {COMMISSION_LABELS[r.commissionType]}
                          {r.commissionType !== "none" && ` · ${r.commissionType.startsWith("percent") ? `${r.commissionRate}%` : formatNaira(r.commissionRate)}`}
                          {!r.isActive && " · inactive"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => copy(link, r.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-700 hover:bg-slate-50 max-w-[240px]"
                          title={link}
                        >
                          {copied === r.id
                            ? <Check className="w-3.5 h-3.5 text-[#0d7c6e] shrink-0" aria-hidden="true" />
                            : <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                          <span className="truncate">?ref={r.code}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.clickCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900 font-medium">{loadingTallies ? "—" : t.registrations}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{loadingTallies ? "—" : t.paidTickets}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{loadingTallies ? "—" : formatNaira(t.grossNaira)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#C21FAF]">{loadingTallies ? "—" : formatNaira(t.commissionNaira)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button" onClick={() => toggleActive(r)}
                            className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            {r.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button" onClick={() => remove(r)} aria-label={`Delete ${r.partnerName}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Clicks are counted once per visitor per browser session and are a traffic signal, not money.
            Commission is calculated only on ticket payments that actually settled.
          </p>
        </>
      )}
    </div>
  );
}
