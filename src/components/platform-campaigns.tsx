"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy, Eye, Loader2, Mail, Plus, Send, Trash2, Upload, X } from "lucide-react";
import { RichTextDisplay } from "@/components/rich-text-display";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/rich-text-editor";

/**
 * Platform → Email campaigns (migration 0141): eventbuddy's own campaigns.
 * Import email lists, then send to a list or to any event's registered,
 * checked-in, no-show or started-but-didn't-buy people. Platform admins only;
 * organizers have their own newsletter on their Audience page.
 */

type ContactList = { id: string; name: string; count: number; createdAt: string };
type EventOption = { id: string; name: string; date: string; eventFormat: string | null; orgName: string };
type Segment = "registered" | "checked_in" | "no_show" | "started_not_bought";
type Audience = { kind: "list"; listId: string } | { kind: "event"; eventId: string; segment: Segment };
type Greeting = { mode: "name"; prefix: string; fallback: string } | { mode: "none" };

type CampaignRow = {
  id: string;
  greeting: Greeting | null;
  subject: string;
  message_html: string;
  cta_label: string | null;
  cta_url: string | null;
  audience: Audience | null;
  audience_label: string | null;
  recipient_count: number;
  sent_count: number;
  next_offset: number;
  pause_at: number | null;
  status: "draft" | "sending" | "paused" | "sent";
  created_at: string;
  updated_at: string;
};
/** A sent campaign loaded back into the composer to edit and send again. */
type Draft = { key: number; draftId?: string; subject: string; messageHtml: string; ctaLabel: string; ctaUrl: string; audience: Audience | null; greeting: Greeting | null };

type SendProgress = { campaignId: string; done: boolean; paused: boolean; nextOffset: number; sentCount: number; total: number };

/** Sends chunk after chunk until the campaign is done or reaches its batch
 *  limit (paused), reporting progress as it goes. */
async function runSend(first: Promise<SendProgress>, onProgress: (p: SendProgress) => void): Promise<SendProgress> {
  let res = await first;
  onProgress(res);
  while (!res.done && !res.paused) {
    res = await api<SendProgress>("/api/platform/campaigns/send", { method: "POST", body: JSON.stringify({ campaignId: res.campaignId, offset: res.nextOffset }) });
    onProgress(res);
  }
  return res;
}

function sentMessage(res: SendProgress): string {
  if (res.paused) return `Sent ${res.nextOffset.toLocaleString()} of ${res.total.toLocaleString()} so far. Paused: use Send next batch in Sent campaigns to continue.`;
  return `Sent to ${res.sentCount.toLocaleString()} of ${res.total.toLocaleString()} people`;
}
/** platform_campaign_results (migration 0142) */
type CampaignResults = {
  campaign_id: string;
  clicks: number;
  visits: number;
  orders: number;
  tickets: number;
  revenue: number;
  registrations: number;
  recipient_orders: number;
  recipient_revenue: number;
};

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
}

const SEGMENTS: { id: Segment; label: string; hint: string }[] = [
  { id: "registered", label: "Registered", hint: "Everyone with a ticket" },
  { id: "checked_in", label: "Checked in", hint: "People who came" },
  { id: "no_show", label: "Didn't show up", hint: "Had a ticket, never checked in (after the event)" },
  { id: "started_not_bought", label: "Started but didn't buy", hint: "Typed their email into the form or went to Paystack, and didn't finish" },
];

const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-line text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json as T;
}

/** Reads a pasted list or a CSV: one person per line, the first cell with an
 *  @ is the email and the first other non-empty cell the name. A header row
 *  ("email,name") is skipped because "email" has no @. */
function parseContacts(text: string): { email: string; name?: string }[] {
  const out: { email: string; name?: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
    const email = cells.find((c) => c.includes("@"));
    if (!email) {
      // a plain pasted line of addresses separated by spaces
      for (const word of line.split(/\s+/)) if (word.includes("@")) out.push({ email: word.replace(/[<>,;"]/g, "") });
      continue;
    }
    const name = cells.find((c) => c && c !== email);
    out.push({ email, ...(name ? { name } : {}) });
  }
  return out;
}

function stripTags(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, "img").replace(/<[^>]+>/g, "").trim();
}

export function PlatformCampaigns() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [drafts, setDrafts] = useState<CampaignRow[]>([]);
  const [resuming, setResuming] = useState<{ id: string; done: number; total: number } | null>(null);
  const [results, setResults] = useState<Record<string, CampaignResults>>({});
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<CampaignRow | null>(null);

  async function deleteCampaign(c: CampaignRow) {
    if (
      !confirm(
        `Delete "${c.subject}" from Sent campaigns?\n\nIts results go with it. Emails already delivered stay in people's inboxes; this can't recall them.`
      )
    )
      return;
    try {
      await api(`/api/platform/campaigns/${c.id}`, { method: "DELETE" });
      if (viewing?.id === c.id) setViewing(null);
      toast.success("Campaign deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the campaign.");
    }
  }

  function continueDraft(c: CampaignRow) {
    setDraft((d) => ({
      key: (d?.key ?? 0) + 1,
      draftId: c.id,
      subject: c.subject,
      messageHtml: c.message_html,
      ctaLabel: c.cta_label ?? "",
      ctaUrl: c.cta_url ?? "",
      audience: c.audience,
      greeting: c.greeting,
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteDraft(c: CampaignRow) {
    if (!confirm(`Delete the draft "${c.subject || "Untitled"}"?`)) return;
    try {
      await api(`/api/platform/campaigns/${c.id}`, { method: "DELETE" });
      if (draft?.draftId === c.id) setDraft(null);
      toast.success("Draft deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the draft.");
    }
  }

  async function sendNextBatch(c: CampaignRow) {
    const left = c.recipient_count - c.next_offset;
    const answer = window.prompt(
      `How many to send now? ${left.toLocaleString()} of the original list still to go (anyone added to the audience since is included too).\nLeave empty to send to everyone left.`,
      String(Math.min(left, 100) || 100)
    );
    if (answer === null) return;
    const limit = answer.trim() ? Math.floor(Number(answer.replace(/[^0-9]/g, ""))) : undefined;
    if (answer.trim() && (!limit || limit < 1)) return toast.error("Enter a number, or leave it empty to send to everyone left.");
    setResuming({ id: c.id, done: c.next_offset, total: c.recipient_count });
    try {
      const res = await runSend(
        api<SendProgress>("/api/platform/campaigns/send", { method: "POST", body: JSON.stringify({ campaignId: c.id, resume: true, ...(limit ? { limit } : {}) }) }),
        (p) => setResuming({ id: c.id, done: p.nextOffset, total: p.total })
      );
      toast.success(sentMessage(res));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The batch stopped. Its row shows how far it got.");
    } finally {
      setResuming(null);
      load();
    }
  }

  function reuse(c: CampaignRow) {
    // a new key each time remounts the composer with this campaign's content
    setDraft((d) => ({ key: (d?.key ?? 0) + 1, subject: c.subject, messageHtml: c.message_html, ctaLabel: c.cta_label ?? "", ctaUrl: c.cta_url ?? "", audience: c.audience, greeting: c.greeting }));
    setViewing(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Loaded into New campaign. Edit it, choose who to send to, then send.");
  }
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [listJson, eventRes, campaignRes] = await Promise.all([
      api<{ lists: ContactList[] }>("/api/platform/campaigns/lists").catch(() => ({ lists: [] })),
      supabase.from("events").select("id, name, date, event_format, organizations(name)").order("date", { ascending: false }).limit(500),
      supabase
        .from("platform_campaigns")
        .select("id, subject, message_html, cta_label, cta_url, greeting, audience, audience_label, recipient_count, sent_count, next_offset, pause_at, status, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setLists(listJson.lists);
    setEvents(
      (eventRes.data ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        eventFormat: e.event_format,
        orgName: (e.organizations as unknown as { name?: string } | null)?.name ?? "",
      }))
    );
    const all = (campaignRes.data ?? []) as CampaignRow[];
    setDrafts(all.filter((r) => r.status === "draft").sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    const rows = all.filter((r) => r.status !== "draft");
    setCampaigns(rows);
    setLoading(false);
    if (rows.length) {
      const { data: res } = await supabase.rpc("platform_campaign_results", { p_campaigns: rows.map((r) => r.id) });
      setResults(Object.fromEntries(((res ?? []) as CampaignResults[]).map((r) => [r.campaign_id, r])));
    }
    setResultsLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteList(list: ContactList) {
    if (!confirm(`Delete "${list.name}" and its ${list.count.toLocaleString()} contacts? Past campaigns keep their record.`)) return;
    try {
      await api(`/api/platform/campaigns/lists/${list.id}`, { method: "DELETE" });
      toast.success("List deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the list.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading campaigns…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">Email campaigns</h2>
        <p className="text-sm text-muted mt-1">
          eventbuddy&apos;s own emails: send to a list you import, or to any event&apos;s registered, checked-in, no-show or started-but-didn&apos;t-buy
          people. Every email has an unsubscribe link, and anyone who unsubscribes is never emailed by a campaign again.
        </p>
      </div>

      <Composer key={draft?.key ?? 0} draft={draft} lists={lists} events={events} onSent={() => { setDraft(null); load(); }} onDraftSaved={load} />

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-fg">Contact lists</h3>
          <button type="button" onClick={() => setShowImport(true)} className="eb-btn eb-btn--primary text-sm">
            <Upload size={14} aria-hidden="true" /> Import a list
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">List</th>
                <th className="px-4 py-2.5 text-right font-medium">Contacts</th>
                <th className="px-4 py-2.5 text-right font-medium">Imported</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {lists.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No lists yet. Import one to send to people outside your events.
                  </td>
                </tr>
              ) : (
                lists.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium text-fg">{l.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-2">{l.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-fg-3">{new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => deleteList(l)} aria-label={`Delete ${l.name}`} className="p-1.5 text-subtle hover:text-rose-300">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drafts.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">Drafts</h3>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line-soft">
                {drafts.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-medium text-fg">{d.subject || <span className="text-muted">Untitled draft</span>}</td>
                    <td className="px-4 py-3 text-right text-fg-3 whitespace-nowrap">
                      Saved {new Date(d.updated_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => continueDraft(d)} className="mr-1 text-sm font-medium text-brand-500 hover:underline">
                        Continue
                      </button>
                      <button type="button" onClick={() => deleteDraft(d)} aria-label={`Delete draft ${d.subject || "Untitled"}`} title="Delete draft" className="p-1.5 text-subtle hover:text-rose-300">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-fg">Sent campaigns</h3>
        <p className="mb-2 text-xs text-muted">
          <strong className="text-fg-2">Clicks</strong>, <strong className="text-fg-2">Tickets</strong> and <strong className="text-fg-2">Revenue</strong> count people who came
          through the email&apos;s links to eventbuddy. <strong className="text-fg-2">Bought after</strong> counts anyone it was sent to who bought a ticket
          afterwards, however they got to the page.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-muted">
              <tr className="whitespace-nowrap">
                <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                <th className="px-4 py-2.5 text-left font-medium">Sent to</th>
                <th className="px-4 py-2.5 text-right font-medium">Delivered</th>
                <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
                <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-4 py-2.5 text-right font-medium" title="Anyone it was sent to who bought a ticket afterwards, however they got to the page">
                  Bought after
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Date</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-muted">
                    No campaigns sent yet.
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="align-middle">
                    <td className="px-4 py-3 font-medium text-fg min-w-[14rem] max-w-[22rem]">
                      <span className="line-clamp-2" title={c.subject}>
                        {c.subject}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-fg-2 min-w-[9rem] max-w-[14rem]">
                      <span className="line-clamp-2" title={c.audience_label ?? ""}>
                        {c.audience_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-2 whitespace-nowrap">
                      {c.sent_count.toLocaleString()} of {c.recipient_count.toLocaleString()}
                      {c.status === "sending" ? <span className="block text-[11px] text-amber-300">stopped part-way</span> : null}
                      {c.status === "paused" ? (
                        resuming?.id === c.id ? (
                          <span className="block text-[11px] text-muted">
                            sending… {resuming.done.toLocaleString()} of {resuming.total.toLocaleString()}
                          </span>
                        ) : (
                          <>
                            <span className="block text-[11px] text-amber-300">paused</span>
                            <button type="button" disabled={!!resuming} onClick={() => sendNextBatch(c)} className="mt-1 text-[11px] font-medium text-brand-500 hover:underline disabled:opacity-50">
                              Send next batch
                            </button>
                          </>
                        )
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-2 whitespace-nowrap">{results[c.id] ? results[c.id].clicks.toLocaleString() : resultsLoaded ? "–" : "…"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-fg whitespace-nowrap">
                      {results[c.id] ? results[c.id].tickets.toLocaleString() : resultsLoaded ? "–" : "…"}
                      {results[c.id]?.registrations ? <span className="block text-[11px] text-subtle">+{results[c.id].registrations.toLocaleString()} free sign-ups</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-2 whitespace-nowrap">{results[c.id] ? naira(results[c.id].revenue) : resultsLoaded ? "–" : "…"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-2 whitespace-nowrap">
                      {results[c.id] ? (
                        <>
                          {results[c.id].recipient_orders.toLocaleString()}
                          {results[c.id].recipient_orders ? <span className="block text-[11px] text-subtle">{naira(results[c.id].recipient_revenue)}</span> : null}
                        </>
                      ) : resultsLoaded ? (
                        "–"
                      ) : (
                        "…"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-fg-3 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setViewing(c)} aria-label={`View ${c.subject}`} title="View" className="p-1.5 text-subtle hover:text-fg-2">
                        <Eye size={15} />
                      </button>
                      <button type="button" onClick={() => reuse(c)} aria-label={`Reuse ${c.subject}`} title="Reuse: edit and send again" className="p-1.5 text-subtle hover:text-fg-2">
                        <Copy size={15} />
                      </button>
                      <button type="button" onClick={() => deleteCampaign(c)} aria-label={`Delete ${c.subject}`} title="Delete" className="p-1.5 text-subtle hover:text-rose-300">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="view-title">
          <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-line-soft shrink-0">
              <div>
                <h3 id="view-title" className="font-semibold text-fg">{viewing.subject}</h3>
                <p className="text-xs text-muted mt-1">
                  Sent to {viewing.audience_label} · {viewing.sent_count.toLocaleString()} of {viewing.recipient_count.toLocaleString()} delivered ·{" "}
                  {new Date(viewing.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="text-subtle hover:text-fg-3">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <RichTextDisplay html={viewing.message_html} />
              {viewing.cta_label && viewing.cta_url ? (
                <p className="mt-4 text-sm text-fg-2">
                  Button: <span className="font-medium text-fg">{viewing.cta_label}</span> → <span className="break-all text-[#c4b5fd]">{viewing.cta_url}</span>
                </p>
              ) : null}
            </div>
            <div className="p-5 border-t border-line-soft shrink-0">
              <button type="button" onClick={() => reuse(viewing)} className="eb-btn eb-btn--primary w-full justify-center">
                <Copy size={14} aria-hidden="true" /> Reuse this campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          lists={lists}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Composer({
  draft,
  lists,
  events,
  onSent,
  onDraftSaved,
}: {
  draft: Draft | null;
  lists: ContactList[];
  events: EventOption[];
  onSent: () => void;
  onDraftSaved: () => void;
}) {
  const a = draft?.audience;
  const [kind, setKind] = useState<"list" | "event">(a?.kind ?? "list");
  const [draftId, setDraftId] = useState<string | undefined>(draft?.draftId);
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; at?: string; error?: string }>({ status: draft?.draftId ? "saved" : "idle" });
  const [limit, setLimit] = useState("");
  const [listId, setListId] = useState(a?.kind === "list" && lists.some((l) => l.id === a.listId) ? a.listId : "");
  const [eventId, setEventId] = useState(a?.kind === "event" ? a.eventId : "");
  const [segment, setSegment] = useState<Segment>(a?.kind === "event" ? a.segment : "registered");
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState("");
  const [countAttempt, setCountAttempt] = useState(0);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [messageHtml, setMessageHtml] = useState(draft?.messageHtml ?? "");
  const [showCta, setShowCta] = useState(!!draft?.ctaLabel);
  const [ctaLabel, setCtaLabel] = useState(draft?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(draft?.ctaUrl ?? "");
  const g = draft?.greeting;
  const [greetingMode, setGreetingMode] = useState<"name" | "none">(g?.mode ?? "name");
  const [greetingPrefix, setGreetingPrefix] = useState(g?.mode === "name" ? g.prefix : "Hi");
  const [greetingFallback, setGreetingFallback] = useState(g?.mode === "name" ? g.fallback : "Hi there,");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ sent: number; done: number; total: number } | null>(null);

  const selectedEvent = events.find((e) => e.id === eventId);
  const audience: Audience | null = useMemo(
    () => (kind === "list" ? (listId ? { kind: "list", listId } : null) : eventId ? { kind: "event", eventId, segment } : null),
    [kind, listId, eventId, segment]
  );

  // live count of who this would reach (after unsubscribes)
  useEffect(() => {
    if (!audience) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(null);
      setCountError("");
      return;
    }
    let cancelled = false;
    setCount(null);
    setCountError("");
    api<{ count: number }>("/api/platform/campaigns/audience", { method: "POST", body: JSON.stringify({ audience }) })
      .then((j) => !cancelled && setCount(j.count))
      .catch((err) => !cancelled && setCountError(err instanceof Error ? err.message : "Couldn't count this audience."));
    return () => {
      cancelled = true;
    };
  }, [audience, countAttempt]);

  // ---- drafts: autosaved a couple of seconds after you stop typing
  const greetingValue: Greeting =
    greetingMode === "none" ? { mode: "none" } : { mode: "name", prefix: greetingPrefix.trim() || "Hi", fallback: greetingFallback.trim() || "Hi there," };
  const snapshot = JSON.stringify({
    subject,
    messageHtml,
    ctaLabel: showCta ? ctaLabel : "",
    ctaUrl: showCta ? ctaUrl : "",
    audience,
    greeting: greetingValue,
  });
  const lastSaved = useRef(draft?.draftId ? snapshot : "");
  const saving = useRef(false);

  const saveDraft = useCallback(async () => {
    if (saving.current) return;
    if (!subject.trim() && !stripTags(messageHtml)) return;
    if (snapshot === lastSaved.current) return;
    saving.current = true;
    setSaveState({ status: "saving" });
    try {
      const res = await api<{ id: string; savedAt: string }>("/api/platform/campaigns/drafts", {
        method: "POST",
        body: JSON.stringify({
          id: draftId,
          subject,
          messageHtml,
          ctaLabel: showCta ? ctaLabel : undefined,
          ctaUrl: showCta ? ctaUrl : undefined,
          audience,
          greeting: greetingValue,
        }),
      });
      lastSaved.current = snapshot;
      if (!draftId) onDraftSaved();
      setDraftId(res.id);
      setSaveState({ status: "saved", at: res.savedAt });
    } catch (err) {
      setSaveState({ status: "error", error: err instanceof Error ? err.message : "Couldn't save the draft." });
    } finally {
      saving.current = false;
    }
    // greetingValue is derived from the snapshot's own fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, draftId, onDraftSaved]);

  useEffect(() => {
    if (progress) return;
    const t = setTimeout(saveDraft, 2000);
    return () => clearTimeout(t);
  }, [saveDraft, progress]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!audience) return setError("Choose who to send to.");
    if (!subject.trim() || !messageHtml.trim()) return setError("Write a subject and a message.");
    if (!count) return setError("Nobody to send to in this audience.");
    const batchLimit = limit.trim() ? Math.floor(Number(limit)) : undefined;
    if (limit.trim() && (!batchLimit || batchLimit < 1)) return setError("Enter how many to send now, or leave it empty to send to everyone.");
    const sendNow = batchLimit ? Math.min(batchLimit, count) : count;
    if (
      !confirm(
        batchLimit && batchLimit < count
          ? `Send "${subject.trim()}" to the first ${sendNow.toLocaleString()} of ${count.toLocaleString()} people now? The rest wait until you click Send next batch.`
          : `Send "${subject.trim()}" to ${count.toLocaleString()} people? This can't be undone.`
      )
    )
      return;
    setError("");
    try {
      const res = await runSend(api<SendProgress>("/api/platform/campaigns/send", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          messageHtml,
          ctaLabel: showCta && ctaLabel.trim() ? ctaLabel.trim() : undefined,
          ctaUrl: showCta && ctaUrl.trim() ? ctaUrl.trim() : undefined,
          audience,
          draftId,
          ...(batchLimit ? { limit: batchLimit } : {}),
          greeting:
            greetingMode === "none"
              ? { mode: "none" }
              : { mode: "name", prefix: greetingPrefix.trim() || "Hi", fallback: greetingFallback.trim() || "Hi there," },
        }),
      }), (p) => setProgress({ sent: p.sentCount, done: p.nextOffset, total: Math.min(p.total, batchLimit ?? p.total) }));
      toast.success(sentMessage(res));
      setDraftId(undefined);
      setSaveState({ status: "idle" });
      setLimit("");
      setSubject("");
      setMessageHtml("");
      setShowCta(false);
      setCtaLabel("");
      setCtaUrl("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The campaign stopped. Check Sent campaigns below for how far it got.");
      onSent();
    } finally {
      setProgress(null);
    }
  }

  const sending = progress !== null;

  return (
    <form onSubmit={send} className="eb-card p-5 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Mail size={15} className="text-[#a78bfa]" aria-hidden="true" /> New campaign
      </h3>
      {draft ? (
        <p className="text-xs text-[#c4b5fd] -mt-2">
          Reusing a sent campaign. It goes out as a new campaign with its own results; check who it&apos;s going to before you send.
        </p>
      ) : null}

      <div>
        <label className="block text-xs font-medium text-fg-2 mb-1.5">Send to</label>
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as "list" | "event")} className={`${fieldClass} sm:w-auto`} aria-label="Audience type">
            <option value="list">An imported list</option>
            <option value="event">People from an event</option>
          </select>
          {kind === "list" ? (
            <select value={listId} onChange={(e) => setListId(e.target.value)} className={`${fieldClass} sm:flex-1`} aria-label="List">
              <option value="">{lists.length ? "Choose a list" : "Import a list first (below)"}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count.toLocaleString()})
                </option>
              ))}
            </select>
          ) : (
            <>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={`${fieldClass} sm:flex-1`} aria-label="Event">
                <option value="">Choose an event</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                    {ev.orgName ? ` · ${ev.orgName}` : ""} · {new Date(ev.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </option>
                ))}
              </select>
              <select value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className={`${fieldClass} sm:w-auto`} aria-label="Who from the event">
                {SEGMENTS.filter((s) => selectedEvent?.eventFormat !== "virtual" || s.id === "registered" || s.id === "started_not_bought").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {kind === "event" && <p className="text-xs text-subtle mt-1.5">{SEGMENTS.find((s) => s.id === segment)?.hint}</p>}
        {audience && (
          <p className={`text-xs mt-1.5 ${countError ? "text-amber-300" : "text-muted"}`}>
            {countError || (count === null ? "Counting…" : `${count.toLocaleString()} ${count === 1 ? "person" : "people"} (unsubscribed people left out)`)}
            {countError ? (
              <button type="button" onClick={() => setCountAttempt((n) => n + 1)} className="ml-2 font-medium text-brand-500 hover:underline">
                Retry
              </button>
            ) : null}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="campaign-subject" className="block text-xs font-medium text-fg-2 mb-1.5">
          Subject
        </label>
        <input id="campaign-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. Tickets for Lagos Tech Week are live" className={fieldClass} />
      </div>
      <div>
        <label className="block text-xs font-medium text-fg-2 mb-1.5">Greeting</label>
        <div className="flex flex-wrap items-center gap-2">
          <select value={greetingMode} onChange={(e) => setGreetingMode(e.target.value as "name" | "none")} aria-label="Greeting" className={`${fieldClass} sm:w-auto`}>
            <option value="name">Greet by first name</option>
            <option value="none">No greeting</option>
          </select>
          {greetingMode === "name" ? (
            <>
              <input
                value={greetingPrefix}
                onChange={(e) => setGreetingPrefix(e.target.value)}
                maxLength={30}
                aria-label="Word before the name"
                placeholder="Hi"
                className={`${fieldClass} sm:w-28`}
              />
              <span className="text-sm text-muted">+ first name</span>
            </>
          ) : null}
        </div>
        {greetingMode === "name" ? (
          <div className="mt-2">
            <label htmlFor="greeting-fallback" className="block text-[11px] text-subtle mb-1">
              For people with no name on the list
            </label>
            <input id="greeting-fallback" value={greetingFallback} onChange={(e) => setGreetingFallback(e.target.value)} maxLength={80} placeholder="Hi there," className={fieldClass} />
            <p className="text-[11px] text-subtle mt-1">
              e.g. &ldquo;{(greetingPrefix.trim() || "Hi")} Ada,&rdquo; · or &ldquo;{greetingFallback.trim() || "Hi there,"}&rdquo; when there&apos;s no name
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-subtle mt-1">The email starts straight with your message, so write your own opening line.</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-fg-2 mb-1.5">Message</label>
        <RichTextEditor value={messageHtml} onChange={setMessageHtml} placeholder="Write your message…" minHeightClass="min-h-[220px]" allowImages />
      </div>

      {!showCta ? (
        <button type="button" onClick={() => setShowCta(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline">
          <Plus size={12} aria-hidden="true" /> Add a button
        </button>
      ) : (
        <div className="border border-line rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2">Button</span>
            <button type="button" onClick={() => { setShowCta(false); setCtaLabel(""); setCtaUrl(""); }} className="text-xs text-subtle hover:text-fg-3">
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} placeholder="Button text, e.g. Get tickets" aria-label="Button text" className={fieldClass} />
            <input type="url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" aria-label="Button link" className={fieldClass} />
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-300">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {progress && (
        <div aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted mt-1.5">
            Sending… {progress.done.toLocaleString()} of {progress.total.toLocaleString()}. Keep this page open until it finishes.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-fg-2">
          Send at most
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="all"
            aria-label="Most emails to send now"
            className="w-20 px-2.5 py-1.5 rounded-lg border border-line text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          now
        </label>
        <span className="text-[11px] text-subtle">e.g. 100 a day on Resend&apos;s free plan; the rest wait for Send next batch.</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${saveState.status === "error" ? "text-amber-300" : "text-subtle"}`} aria-live="polite">
          {saveState.status === "saving"
            ? "Saving draft…"
            : saveState.status === "saved" && saveState.at
              ? `Draft saved ${new Date(saveState.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
              : saveState.status === "error"
                ? saveState.error
                : "Drafts save automatically as you write."}
        </span>
        <button type="button" onClick={() => { lastSaved.current = ""; saveDraft(); }} disabled={sending || (!subject.trim() && !stripTags(messageHtml))} className="text-xs font-medium text-brand-500 hover:underline disabled:opacity-50">
          Save draft
        </button>
      </div>

      <button type="submit" disabled={sending || !audience || !count} className="eb-btn eb-btn--primary w-full justify-center disabled:opacity-60">
        {sending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
        {sending
          ? "Sending…"
          : count
            ? limit && Number(limit) < count
              ? `Send to ${Number(limit).toLocaleString()} of ${count.toLocaleString()} now`
              : `Send to ${count.toLocaleString()} ${count === 1 ? "person" : "people"}`
            : "Send campaign"}
      </button>
    </form>
  );
}

function ImportModal({ lists, onClose, onImported }: { lists: ContactList[]; onClose: () => void; onImported: () => void }) {
  const [target, setTarget] = useState<"new" | string>("new");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = useMemo(() => parseContacts(text), [text]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setError("That file is over 8MB. Split it into smaller files.");
    setFileName(file.name);
    setText(await file.text());
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (target === "new" && !name.trim()) return setError("Name the list.");
    if (parsed.length === 0) return setError("Paste some email addresses or choose a CSV file.");
    setBusy(true);
    setError("");
    try {
      const listName = target === "new" ? name.trim() : lists.find((l) => l.id === target)?.name ?? "List";
      const r = await api<{ added: number; duplicates: number; invalid: number; total: number }>("/api/platform/campaigns/lists", {
        method: "POST",
        body: JSON.stringify({ name: listName, ...(target === "new" ? {} : { listId: target }), contacts: parsed.slice(0, 50000) }),
      });
      toast.success(
        `${r.added.toLocaleString()} added${r.duplicates ? `, ${r.duplicates.toLocaleString()} duplicates skipped` : ""}${r.invalid ? `, ${r.invalid.toLocaleString()} invalid skipped` : ""}`
      );
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <form onSubmit={submit} className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-line-soft shrink-0">
          <h3 id="import-title" className="font-semibold text-fg">
            Import email addresses
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-subtle hover:text-fg-3">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-fg-2 mb-1.5">Add to</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={fieldClass} aria-label="Add to">
              <option value="new">A new list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
          {target === "new" && (
            <div>
              <label htmlFor="list-name" className="block text-xs font-medium text-fg-2 mb-1.5">
                List name
              </label>
              <input id="list-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Lagos Tech Week leads" className={fieldClass} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-fg-2 mb-1.5">CSV file</label>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-line text-sm text-fg-2 cursor-pointer hover:bg-fill">
              <Upload size={14} aria-hidden="true" /> {fileName || "Choose a .csv file"}
              <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <p className="text-[11px] text-subtle mt-1.5">One person per row, with an email column and optionally a name column. Excel: File → Save As → CSV.</p>
          </div>
          <div>
            <label htmlFor="paste" className="block text-xs font-medium text-fg-2 mb-1.5">
              …or paste addresses
            </label>
            <textarea
              id="paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={"ada@example.com, Ada Obi\nchinedu@example.com"}
              className={`${fieldClass} font-mono text-xs`}
            />
            <p className="text-xs text-muted mt-1.5">
              {parsed.length.toLocaleString()} address{parsed.length === 1 ? "" : "es"} found
              {parsed.length > 50000 ? " (only the first 50,000 will be imported; split the rest into another import)" : ""}.
            </p>
          </div>
          {error && (
            <p className="flex items-start gap-1.5 text-xs text-rose-300">
              <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
        </div>
        <div className="p-5 border-t border-line-soft shrink-0">
          <button type="submit" disabled={busy || parsed.length === 0} className="eb-btn eb-btn--primary w-full justify-center disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
            {busy ? "Importing…" : `Import ${parsed.length.toLocaleString()} address${parsed.length === 1 ? "" : "es"}`}
          </button>
        </div>
      </form>
    </div>
  );
}
