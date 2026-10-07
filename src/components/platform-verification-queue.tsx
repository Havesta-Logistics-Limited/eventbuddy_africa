"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, IdCard, X } from "lucide-react";

type Req = {
  id: string;
  orgName: string;
  orgEmail: string | null;
  fullName: string;
  businessName: string | null;
  idType: string;
  cacNumber: string | null;
  hasCac: boolean;
  socialLink: string | null;
  note: string | null;
  requestedAt: string;
  hints: { bankAccountName: string | null; bankName: string | null; nameMatch: "match" | "partial" | "none" | "unknown"; accountAgeDays: number | null; paidTicketsSold: number; refundsOrDisputes: number };
};

const MATCH: Record<Req["hints"]["nameMatch"], { text: string; cls: string }> = {
  match: { text: "Bank name matches", cls: "text-emerald-300 bg-emerald-500/15" },
  partial: { text: "Bank name partly matches", cls: "text-amber-300 bg-amber-500/15" },
  none: { text: "Bank name doesn't match", cls: "text-rose-300 bg-rose-500/15" },
  unknown: { text: "No bank account yet", cls: "text-muted bg-fill" },
};

/** Platform → Payouts: organizer verification requests to review (0118). */
export function PlatformVerificationQueue() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<{ id: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/platform/verification");
    if (res.ok) setReqs((await res.json()).requests);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() only sets state after awaiting
    load();
  }, [load]);

  async function decide(id: string, action: "approve" | "decline", reason?: string) {
    if (action === "approve" && !window.confirm("Approve and verify this organizer? Their sales limit is lifted and they can take early payouts.")) return;
    setBusy(id);
    const res = await fetch("/api/platform/verification/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, action, reason }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.error(json.error || "Couldn't update the request.");
    toast.success(action === "approve" ? "Verified, and we've emailed them" : "Declined, and we've emailed them your note");
    setDeclining(null);
    load();
  }

  if (!reqs.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <IdCard size={15} className="text-[#ff8af5]" aria-hidden="true" /> Verification requests ({reqs.length})
      </h2>
      <div className="eb-card divide-y divide-line-soft">
        {reqs.map((r) => (
          <div key={r.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">
                  {r.orgName} <span className="font-normal text-muted">· {r.orgEmail}</span>
                </p>
                <p className="mt-1 text-sm text-fg-2">
                  {r.fullName}
                  {r.businessName ? ` · trading as ${r.businessName}` : ""} · {r.idType}
                  {r.cacNumber ? ` · CAC ${r.cacNumber}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${MATCH[r.hints.nameMatch].cls}`} title={r.hints.bankAccountName ? `${r.hints.bankAccountName} · ${r.hints.bankName ?? ""}` : undefined}>
                    {MATCH[r.hints.nameMatch].text}
                    {r.hints.bankAccountName ? `: ${r.hints.bankAccountName}` : ""}
                  </span>
                  <span className="rounded-full bg-fill px-2 py-0.5 text-fg-3">Account {r.hints.accountAgeDays ?? "?"} days old</span>
                  <span className="rounded-full bg-fill px-2 py-0.5 text-fg-3">{r.hints.paidTicketsSold} paid tickets sold</span>
                  <span className={`rounded-full px-2 py-0.5 ${r.hints.refundsOrDisputes ? "bg-rose-500/15 text-rose-300" : "bg-fill text-fg-3"}`}>{r.hints.refundsOrDisputes} refunds or disputes</span>
                </div>
                {r.note && <p className="mt-2 text-xs text-muted">&ldquo;{r.note}&rdquo;</p>}
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <a className="eb-link inline-flex items-center gap-1" href={`/api/platform/verification/doc?requestId=${r.id}&kind=id`} target="_blank" rel="noreferrer">
                    <FileText size={12} /> View ID
                  </a>
                  {r.hasCac && (
                    <a className="eb-link inline-flex items-center gap-1" href={`/api/platform/verification/doc?requestId=${r.id}&kind=cac`} target="_blank" rel="noreferrer">
                      <FileText size={12} /> View CAC certificate
                    </a>
                  )}
                  {r.socialLink && (
                    <a className="eb-link inline-flex items-center gap-1" href={r.socialLink} target="_blank" rel="noreferrer noopener">
                      <ExternalLink size={12} /> {r.socialLink.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  <span className="text-subtle">Sent {new Date(r.requestedAt).toLocaleString("en-GB")}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => decide(r.id, "approve")} className="eb-btn eb-btn--primary">
                  <Check size={14} aria-hidden="true" /> Approve
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => setDeclining({ id: r.id, reason: "" })} className="eb-btn eb-btn--ghost">
                  <X size={14} aria-hidden="true" /> Decline
                </button>
              </div>
            </div>
            {declining?.id === r.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="eb-input min-w-0 flex-1"
                  aria-label="Reason the organizer will see"
                  placeholder="Reason they'll see, e.g. the ID photo is blurry"
                  maxLength={500}
                  value={declining.reason}
                  onChange={(e) => setDeclining({ id: r.id, reason: e.target.value })}
                />
                <button type="button" disabled={!declining.reason.trim() || busy === r.id} onClick={() => decide(r.id, "decline", declining.reason.trim())} className="eb-btn eb-btn--primary">
                  Decline
                </button>
                <button type="button" onClick={() => setDeclining(null)} className="eb-btn eb-btn--ghost">Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
