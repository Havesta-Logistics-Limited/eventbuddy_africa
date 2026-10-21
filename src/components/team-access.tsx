"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, X } from "lucide-react";
import type { EventRecord } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail } from "@/lib/validation";
import {
  EVENT_HELPER,
  FULL_ACCESS,
  SECTION_HINTS,
  SECTION_LABELS,
  TEAM_SECTIONS,
  VIEW_EVERYTHING,
  parsePermissions,
  presetOf,
  summarizePermissions,
  type TeamAccess,
  type TeamPermissions,
} from "@/lib/team-permissions";

type Member = {
  id: string;
  email: string;
  role: "admin" | "event_support";
  eventId: string | null;
  status: "pending" | "active";
  permissions: TeamPermissions;
};

const ACCESS: { id: TeamAccess; label: string }[] = [
  { id: "none", label: "No access" },
  { id: "view", label: "View" },
  { id: "edit", label: "View & edit" },
];

/** On a one-event invite only these pages apply. */
const EVENT_SECTIONS = ["events", "leads"] as const;

/** Scope + preset + per-page access; shared by the invite form and the edit dialog. */
function AccessEditor({
  role,
  setRole,
  eventId,
  setEventId,
  permissions,
  setPermissions,
  events,
}: {
  role: "admin" | "event_support";
  setRole: (r: "admin" | "event_support") => void;
  eventId: string;
  setEventId: (id: string) => void;
  permissions: TeamPermissions;
  setPermissions: (p: TeamPermissions) => void;
  events: EventRecord[];
}) {
  const preset = presetOf(permissions);
  const sections = role === "event_support" ? EVENT_SECTIONS : TEAM_SECTIONS;
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-fg-2">Scope</p>
        <div className="eb-seg" role="group" aria-label="Scope">
          <button
            type="button"
            aria-pressed={role === "admin"}
            onClick={() => {
              setRole("admin");
              setPermissions(preset === "helper" ? FULL_ACCESS : permissions);
            }}
          >
            Whole organization
          </button>
          <button
            type="button"
            aria-pressed={role === "event_support"}
            onClick={() => {
              setRole("event_support");
              setPermissions({ ...EVENT_HELPER, events: permissions.events === "none" ? "edit" : permissions.events, leads: permissions.leads });
            }}
          >
            One event
          </button>
        </div>
      </div>
      {role === "event_support" && (
        <div>
          <label htmlFor="ta-event" className="mb-1.5 block text-xs font-medium text-fg-2">Event</label>
          <select id="ta-event" value={eventId} onChange={(e) => setEventId(e.target.value)} className="eb-input">
            <option value="" disabled>
              Select an event
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-medium text-fg-2">Access</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(role === "admin"
            ? [
                { id: "full", label: "Full access", p: FULL_ACCESS },
                { id: "view", label: "View everything", p: VIEW_EVERYTHING },
              ]
            : [
                { id: "helper", label: "View & edit this event", p: EVENT_HELPER },
                { id: "viewone", label: "View this event only", p: { ...EVENT_HELPER, events: "view" as const, leads: "view" as const } },
              ]
          ).map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={TEAM_SECTIONS.every((s) => x.p[s] === permissions[s])}
              onClick={() => setPermissions(x.p)}
              className="eb-chip"
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="divide-y divide-line-soft rounded-xl border border-line">
          {sections.map((s) => (
            <div key={s} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{SECTION_LABELS[s]}</p>
                <p className="text-[11px] text-subtle">{SECTION_HINTS[s]}</p>
              </div>
              <div className="eb-seg eb-seg--sm" role="group" aria-label={`${SECTION_LABELS[s]} access`}>
                {ACCESS.filter((a) => !(s === "events" && a.id === "none")).map((a) => (
                  <button key={a.id} type="button" aria-pressed={permissions[s] === a.id} onClick={() => setPermissions({ ...permissions, [s]: a.id })}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">Only you, the owner, can manage the team, change the payout bank account or request payouts.</p>
      </div>
    </div>
  );
}

/**
 * Settings → Team (migration 0137): invite teammates with an access level for
 * each page, see everyone's access, and change or remove it. The owner manages
 * the team; anyone else with Settings access can see it.
 */
export function TeamAccessSection({ orgId, orgSlug, isOwner, events }: { orgId: string | null; orgSlug?: string; isOwner: boolean; events: EventRecord[] }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "event_support">("admin");
  const [eventId, setEventId] = useState("");
  const [permissions, setPermissions] = useState<TeamPermissions>(FULL_ACCESS);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const { data } = await createClient()
      .from("organization_members")
      .select("id, email, role, event_id, status, permissions")
      .eq("organization_id", id)
      .order("invited_at", { ascending: true });
    setMembers(
      (data ?? []).map((m) => ({ id: m.id, email: m.email, role: m.role, eventId: m.event_id, status: m.status, permissions: parsePermissions(m.permissions, m.role) }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (orgId) load(orgId);
  }, [orgId, load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgSlug) return;
    if (!isValidEmail(email.trim())) return setError("Enter a valid email address.");
    if (role === "event_support" && !eventId) return setError("Pick the event this person will help with.");
    setInviting(true);
    setError("");
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role, eventId: role === "event_support" ? eventId : undefined, permissions }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send that invite.");
      toast.success(json.emailSent ? "Invite sent" : "Invite created, but the email couldn't be sent");
      setEmail("");
      setEventId("");
      if (orgId) await load(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that invite.");
    } finally {
      setInviting(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (editing.role === "event_support" && !editing.eventId) return toast.error("Pick the event this person will help with.");
    setBusy(editing.id);
    const { error: err } = await createClient()
      .from("organization_members")
      .update({ role: editing.role, event_id: editing.role === "event_support" ? editing.eventId : null, permissions: editing.permissions })
      .eq("id", editing.id);
    setBusy(null);
    if (err) return toast.error(err.message || "Couldn't save that.");
    setMembers((ms) => ms.map((m) => (m.id === editing.id ? editing : m)));
    setEditing(null);
    toast.success("Access updated. It applies the next time their dashboard refreshes.");
  }

  async function remove(m: Member) {
    if (!window.confirm(`Remove ${m.email} from your team? They lose access straight away.`)) return;
    setBusy(m.id);
    const { error: err } = await createClient().from("organization_members").delete().eq("id", m.id);
    setBusy(null);
    if (err) return toast.error(err.message || "Couldn't remove that person.");
    setMembers((ms) => ms.filter((x) => x.id !== m.id));
    toast.success("Removed from your team");
  }

  return (
    <div>
      <h2 className="mb-4 font-semibold text-fg">Team</h2>
      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <p className="-mt-1 text-xs text-muted">
          Invite teammates with their own dashboard login, and choose what they can see and change on each page.
        </p>
        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-fill" />
        ) : members.length > 0 ? (
          <div className="space-y-2">
            {members.map((m) => {
              const ev = m.eventId ? events.find((e) => e.id === m.eventId) : undefined;
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-canvas/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{m.email}</p>
                    <p className="text-xs text-muted">
                      {`${m.role === "admin" ? "Whole organization" : `One event: ${ev?.name ?? "an event"}`} · ${summarizePermissions(m.permissions)}`}
                      {m.status === "pending" && <span className="text-amber-300"> · Invite pending</span>}
                    </p>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 items-center gap-3">
                      <button type="button" onClick={() => setEditing({ ...m, eventId: m.eventId ?? "" })} className="inline-flex items-center gap-1 text-xs font-medium text-fg-2 hover:underline">
                        <Pencil size={12} aria-hidden="true" /> Change access
                      </button>
                      <button type="button" onClick={() => remove(m)} disabled={busy === m.id} className="text-xs font-medium text-rose-300 hover:underline disabled:opacity-60">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {isOwner ? (
          <form onSubmit={invite} className="space-y-3 border-t border-line-soft pt-3">
            <div>
              <label htmlFor="ta-email" className="mb-1.5 block text-xs font-medium text-fg-2">Email</label>
              <input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" className="eb-input" />
            </div>
            <AccessEditor role={role} setRole={setRole} eventId={eventId} setEventId={setEventId} permissions={permissions} setPermissions={setPermissions} events={events} />
            {error && <p className="text-xs text-rose-300">{error}</p>}
            <button type="submit" disabled={inviting} className="eb-btn eb-btn--primary">
              {inviting ? "Sending invite…" : "Send invite"}
            </button>
          </form>
        ) : (
          <p className="border-t border-line-soft pt-3 text-xs text-subtle">Only the organization&apos;s owner can invite people or change access.</p>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line-soft p-5">
              <h3 className="font-semibold text-fg">{`Access for ${editing.email}`}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="text-subtle hover:text-fg-3">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <AccessEditor
                role={editing.role}
                setRole={(r) => setEditing((m) => (m ? { ...m, role: r } : m))}
                eventId={editing.eventId ?? ""}
                setEventId={(id) => setEditing((m) => (m ? { ...m, eventId: id } : m))}
                permissions={editing.permissions}
                setPermissions={(p) => setEditing((m) => (m ? { ...m, permissions: p } : m))}
                events={events}
              />
              <button type="button" onClick={saveEdit} disabled={busy === editing.id} className="eb-btn eb-btn--primary w-full">
                {busy === editing.id ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null} Save access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
