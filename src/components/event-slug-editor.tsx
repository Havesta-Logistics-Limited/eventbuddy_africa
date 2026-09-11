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

/** Edits one of an event's three independent custom slugs: `slug` (the public
 *  registration link, /[slug]), `staffCheckinSlug`, or `repCheckinSlug` (the
 *  short staff/rep check-in links, also /[slug] — see checkinLinkPath) — kept
 *  as separate columns on purpose, since each link is shared with a
 *  different audience and editing one must never silently change another.
 *  All three live at the same root /[orgSlug] segment (see [orgSlug]/page.tsx),
 *  so all three are checked against RESERVED_SLUGS the same way. */
export function EventSlugEditor({
  event,
  field = "slug",
  label,
  prefix = "eventbuddy.africa/",
}: {
  event: EventRecord;
  field?: "slug" | "staffCheckinSlug" | "repCheckinSlug";
  /** Shown in the button text ("Customize this {label} link") — needed when
   *  two editors for the same event appear together (CheckinLinksCard), so
   *  it's clear which link each one edits. */
  label?: string;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentValue = field === "slug" ? event.slug : field === "staffCheckinSlug" ? event.staffCheckinSlug : event.repCheckinSlug;

  async function handleSave() {
    const cleaned = slugify(input);
    // Reserved words are the ones that would actually be unreachable (shadowed
    // by a real page at that path — see reserved-slugs.ts); a collision with
    // another org's own slug can't be checked here (RLS only lets this browser
    // client see its own org's rows), but that failure mode is just a dead
    // link the organizer would notice immediately, not a security issue.
    if (cleaned && RESERVED_SLUGS.has(cleaned)) {
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
      await updateEvent(event.id, { [field]: cleaned });
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
        {currentValue ? `Edit custom ${label ? `${label} ` : ""}link` : `Customize this ${label ? `${label} ` : ""}link`}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{prefix}</span>
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
