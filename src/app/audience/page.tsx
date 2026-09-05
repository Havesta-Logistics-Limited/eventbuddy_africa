"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, Download, Megaphone, Search, Send, UserCheck, UserMinus, Users, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { resolveMyOrgId, useEvents, useLeads, useRegistrations } from "@/lib/store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Role } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { AuthLoading } from "@/components/auth-loading";
import { RichTextEditor } from "@/components/rich-text-editor";
import { getEventStatus } from "@/lib/capture-window";

const ADMIN_ONLY: Role[] = ["admin"];

type AudienceMember = { email: string; fullName: string; source: "registered" | "follower"; joinedAt: string };
type StatusFilter = "registered" | "checked_in" | "no_show";

function BlastModal({ orgSlug, recipientCount, onClose }: { orgSlug: string; recipientCount: number; onClose: () => void }) {
  const events = useEvents();
  const registrations = useRegistrations();
  const leads = useLeads();

  const [subject, setSubject] = useState("");
  const [messageHtml, setMessageHtml] = useState("");
  const [showCta, setShowCta] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [targetMode, setTargetMode] = useState<"everyone" | "event">("everyone");
  const [eventId, setEventId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("registered");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const selectedEvent = events.find((e) => e.id === eventId);
  const isVirtual = selectedEvent?.eventFormat === "virtual";
  const eventEnded = selectedEvent ? getEventStatus(selectedEvent) === "completed" : false;

  const previewCount = useMemo(() => {
    if (targetMode === "everyone") return recipientCount;
    if (!selectedEvent) return 0;
    if (isVirtual) return leads.filter((l) => l.eventId === selectedEvent.id && l.status === "registered").length;
    const eventRegs = registrations.filter((r) => r.eventId === selectedEvent.id);
    if (statusFilter === "checked_in") return eventRegs.filter((r) => r.status === "checked_in").length;
    if (statusFilter === "no_show") return eventRegs.filter((r) => r.status === "registered" && !r.checkedInAt).length;
    return eventRegs.filter((r) => r.status === "registered" || r.status === "checked_in").length;
  }, [targetMode, recipientCount, selectedEvent, isVirtual, registrations, leads, statusFilter]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !messageHtml.trim()) return;
    if (targetMode === "event" && !eventId) {
      setError("Pick an event to target.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/audience/blast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          messageHtml,
          ctaLabel: showCta && ctaLabel.trim() ? ctaLabel.trim() : undefined,
          ctaUrl: showCta && ctaUrl.trim() ? ctaUrl.trim() : undefined,
          target: targetMode === "event" ? { eventId, status: statusFilter } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't send that blast.");
      toast.success(`Sent to ${json.sentCount} of ${json.totalCount} people`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that blast.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <h3 className="font-semibold text-slate-900">Send a blast</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSend} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Send to</label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value as "everyone" | "event")}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="everyone">Everyone in my audience</option>
                <option value="event">One event&apos;s attendees</option>
              </select>
              {targetMode === "event" && (
                <>
                  <select
                    value={eventId}
                    onChange={(e) => {
                      setEventId(e.target.value);
                      setStatusFilter("registered");
                    }}
                    className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    <option value="" disabled>
                      Select an event
                    </option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                  {selectedEvent && (
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="registered">Registered</option>
                      {!isVirtual && <option value="checked_in">Checked-in</option>}
                      {!isVirtual && eventEnded && <option value="no_show">No-show</option>}
                    </select>
                  )}
                </>
              )}
            </div>
            {targetMode === "event" && selectedEvent && !isVirtual && !eventEnded && statusFilter === "no_show" && (
              <p className="text-xs text-amber-600 mt-1.5">No-show can only be targeted once this event has ended.</p>
            )}
            <p className="text-xs text-slate-500 mt-1.5">Sends to up to {previewCount.toLocaleString()} people.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Subject</label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. We're back with a new event!"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Message</label>
            <RichTextEditor
              value={messageHtml}
              onChange={setMessageHtml}
              placeholder="Write your update, invite, or newsletter…"
              minHeightClass="min-h-[220px]"
              allowImages
            />
          </div>

          <div>
            {!showCta ? (
              <button type="button" onClick={() => setShowCta(true)} className="text-xs font-medium text-brand-600 hover:underline">
                + Add a button
              </button>
            ) : (
              <div className="border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Button</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCta(false);
                      setCtaLabel("");
                      setCtaUrl("");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder="Button text, e.g. Register now"
                    className="px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                  <input
                    type="url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://…"
                    className="px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
          >
            <Send size={14} />
            {sending ? "Sending…" : "Send blast"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UnsubscribedSection({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<{ email: string; createdAt: string }[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("organization_email_suppressions")
      .select("email, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []).map((r) => ({ email: r.email, createdAt: r.created_at })));
        setLoading(false);
      });
  }, [orgId]);

  return (
    <div className="mt-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <UserMinus size={15} className="text-slate-400" />
          Unsubscribed {!loading && `(${rows.length})`}
        </span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {loading ? (
            <div className="p-4 text-xs text-slate-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-xs text-slate-400">Nobody has unsubscribed from your blasts.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((r) => (
                <div key={r.email} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-700">{r.email}</span>
                  <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString("en-GB")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Everyone who's ever joined this org's audience — either by registering for one
 *  of its events, or by explicitly following (see FollowOrgButton) without
 *  necessarily registering for anything. Read-only for now: the actual send
 *  pipeline (invites to a new event, newsletters, reminders) is a later pass — see
 *  organization_audience/organization_audience_count (migration 0065). */
export default function AudiencePage() {
  const session = useRequireRole(ADMIN_ONLY);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [search, setSearch] = useState("");
  const [showBlast, setShowBlast] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    resolveMyOrgId(supabase).then(async (id) => {
      if (!id) {
        setLoading(false);
        return;
      }
      setOrgId(id);
      const { data, error } = await supabase.rpc("organization_audience", { p_organization_id: id });
      if (error) {
        toast.error("Couldn't load your audience.");
      } else {
        setMembers((data ?? []).map((r: { email: string; full_name: string | null; source: string; joined_at: string }) => ({
          email: r.email,
          fullName: r.full_name || "",
          source: r.source as "registered" | "follower",
          joinedAt: r.joined_at,
        })));
      }
      setLoading(false);
    });
  }, []);

  if (!session) return <AuthLoading />;

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return m.email.toLowerCase().includes(q) || m.fullName.toLowerCase().includes(q);
  });
  const followerCount = members.filter((m) => m.source === "follower").length;

  function exportAudience() {
    const headers = ["Name", "Email", "Source", "Joined"];
    const rows = filtered.map((m) => [m.fullName, m.email, m.source === "follower" ? "Follower" : "Attendee", new Date(m.joinedAt).toLocaleDateString("en-GB")]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadCsv("audience.csv", csv);
  }

  return (
    <Shell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl text-slate-900">Audience</h1>
            <p className="text-slate-500 text-sm mt-0.5">Everyone who&apos;s registered for one of your events or followed you directly.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBlast(true)}
              disabled={members.length === 0}
              title={members.length === 0 ? "You don't have an audience yet" : undefined}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              Send blast
            </button>
            {members.length > 0 && (
              <button
                onClick={exportAudience}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Download size={14} />
                Export
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Total audience</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : members.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={15} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Direct followers</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : followerCount}</p>
          </div>
        </div>

        <div className="relative max-w-sm mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your audience…"
            className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
            <Megaphone size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">{members.length === 0 ? "No audience yet" : "No matches"}</p>
            <p className="text-xs text-slate-400 mt-1.5">
              {members.length === 0 ? "Anyone who registers for an event or follows you will show up here." : "Try a different search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Name", "Email", "Source", "Joined"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((m) => (
                    <tr key={m.email}>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{m.fullName || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{m.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            m.source === "follower" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {m.source === "follower" ? "Follower" : "Attendee"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(m.joinedAt).toLocaleDateString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {orgId && <UnsubscribedSection orgId={orgId} />}
      </div>
      {showBlast && session.orgSlug && <BlastModal orgSlug={session.orgSlug} recipientCount={members.length} onClose={() => setShowBlast(false)} />}
    </Shell>
  );
}
