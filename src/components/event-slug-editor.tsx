"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Edit2, X } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { PersistError, updateEvent } from "@/lib/store";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Edits one of an event's two independent custom slugs: `slug` (the public
 *  registration link, /[slug]) or `checkinSlug` (the staff/rep check-in
 *  link) — kept as separate columns on purpose, since a check-in link is
 *  shared with staff and a registration link with attendees, and editing
 *  one must never silently change the other. */
export function EventSlugEditor({ event, field = "slug" }: { event: EventRecord; field?: "slug" | "checkinSlug" }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentValue = field === "slug" ? event.slug : event.checkinSlug;

  async function handleSave() {
    const cleaned = slugify(input);
    // Reserved words are the ones that would actually be unreachable (shadowed
    // by a real page at that path — see reserved-slugs.ts); a collision with
    // another org's own slug can't be checked here (RLS only lets this browser
    // client see its own org's rows), but that failure mode is just a dead
    // link the organizer would notice immediately, not a security issue.
    if (cleaned && field === "slug" && RESERVED_SLUGS.has(cleaned)) {
      setError("That link is reserved — try another.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // `cleaned` is always a real string here (never undefined) specifically so
      // eventToRow's `!== undefined` check fires and an empty value actually nulls
      // the column out — passing undefined would make it skip the field entirely,
      // silently failing to clear a previously-set custom link.
      await updateEvent(event.id, field === "slug" ? { slug: cleaned } : { checkinSlug: cleaned });
      setEditing(false);
      toast.success(cleaned ? "Custom link saved" : "Custom link removed");
    } catch (err) {
      const code = err instanceof PersistError && err.cause && typeof err.cause === "object" && "code" in err.cause ? (err.cause as { code?: string }).code : undefined;
      setError(code === "23505" ? "This link is already taken — try another." : err instanceof PersistError ? err.message : "Couldn't save this link.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setInput(currentValue ?? "");
          setEditing(true);
        }}
        className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-brand-600"
      >
        <Edit2 size={10} />
        {currentValue ? "Edit custom link" : "Customize this link"}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">eventbuddy.africa/</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="your-event-name"
          className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <button type="button" onClick={handleSave} disabled={saving} className="p-1.5 rounded-lg text-emerald-600 border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50 shrink-0">
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError("");
          }}
          className="p-1.5 rounded-lg text-slate-500 border border-slate-200 hover:bg-slate-50 shrink-0"
        >
          <X size={13} />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">Leave blank to use the default link. Letters, numbers, and dashes only.</p>
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
