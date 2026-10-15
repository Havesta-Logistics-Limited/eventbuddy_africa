"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Globe, Lock, RefreshCw } from "lucide-react";
import type { EventRecord } from "@/lib/types";
import { updateEvent, PersistError } from "@/lib/store";
import { copyText } from "@/lib/copy-text";

/** eventbuddy.africa/p/{code} for a private event (migration 0128). */
export function privateEventLink(code: string | null | undefined): string {
  if (!code || typeof window === "undefined") return "";
  return `${window.location.origin}/p/${code}`;
}

/**
 * On the event page: who can see the event (public, or private with a link to
 * share) and whether registration and ticket sales are open yet. Opening
 * registration emails everyone who asked to be told.
 */
export function EventAccessControls({ event, orgSlug }: { event: EventRecord; orgSlug: string }) {
  const [busy, setBusy] = useState<"" | "visibility" | "link" | "registration">("");
  const [copied, setCopied] = useState(false);
  const isPrivate = event.visibility === "private";
  const isOpen = event.registrationOpen !== false;
  const link = isPrivate ? privateEventLink(event.privateCode) : "";

  async function setVisibility(v: "public" | "private") {
    if (v === event.visibility) return;
    if (v === "private" && !window.confirm("Make this event private? It's taken off Discover, your profile and search, and its normal link stops working. You'll get a private link to share instead.")) return;
    setBusy("visibility");
    try {
      await updateEvent(event.id, { visibility: v });
      toast.success(v === "private" ? "Event is private. Share its private link." : "Event is public again.");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't change this. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function newLink() {
    if (!window.confirm("Make a new private link? The current link stops working straight away, so anyone you shared it with will need the new one.")) return;
    setBusy("link");
    try {
      await updateEvent(event.id, { privateCode: null });
      toast.success("New private link made. The old one no longer works.");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't make a new link. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function setRegistration(open: boolean) {
    setBusy("registration");
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(event.id)}/open-registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Couldn't update registration (error ${res.status}).`);
      // keep this page's copy of the event in step
      await updateEvent(event.id, { registrationOpen: open });
      toast.success(open ? `Registration is open${j.notified ? `: ${j.notified} ${j.notified === 1 ? "person" : "people"} emailed` : ""}` : "Registration paused: the page shows \"opens soon\"");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update registration.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="eac mt-3">
      <div className="eac-row">
        <span className="eac-label">Who can see it</span>
        <div className="eb-seg" role="group" aria-label="Who can see it">
          <button type="button" aria-pressed={!isPrivate} disabled={!!busy} onClick={() => setVisibility("public")}>
            <Globe size={13} aria-hidden="true" /> Public
          </button>
          <button type="button" aria-pressed={isPrivate} disabled={!!busy} onClick={() => setVisibility("private")}>
            <Lock size={13} aria-hidden="true" /> Private
          </button>
        </div>
      </div>
      {isPrivate && (
        <div className="eac-link">
          <span className="truncate font-mono text-xs">{link || "Making the private link…"}</span>
          <button
            type="button"
            disabled={!link}
            onClick={() =>
              copyText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
            className="eac-btn"
          >
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" disabled={!!busy} onClick={newLink} className="eac-btn" title="Make a new link; the current one stops working">
            <RefreshCw size={13} aria-hidden="true" className={busy === "link" ? "animate-spin" : undefined} /> New link
          </button>
        </div>
      )}
      <div className="eac-row">
        <span className="eac-label">Registration & tickets</span>
        {isOpen ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="eac-pill eac-pill--open">Open</span>
            <button type="button" disabled={!!busy} onClick={() => setRegistration(false)} className="eac-btn">
              Pause (show &ldquo;opens soon&rdquo;)
            </button>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <span className="eac-pill">Not open yet</span>
            <button type="button" disabled={!!busy} onClick={() => setRegistration(true)} className="eac-btn eac-btn--go">
              {busy === "registration" ? "Opening…" : "Open registration"}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
